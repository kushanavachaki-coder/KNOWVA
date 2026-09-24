/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithTimeout } from './utils/apiTimeout';
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import Header from './components/Header';
import HomeSection from './components/HomeSection';
import StudyMaterialSection from './components/StudyMaterialSection';
import ChatSection from './components/ChatSection';
import PlaceholderSection from './components/PlaceholderSection';
import ProfileSection from './components/ProfileSection';
import SmartRevisionSection from './components/SmartRevisionSection';
import { TabType, StudyMaterial, Message, StudyNote, User, UserSettings } from './types';
import { Sparkles, Activity, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Database, Cpu, Brain, Check, Info, Trash2 } from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  updateDoc 
} from 'firebase/firestore';

export default function App() {
  // Default active tab is HOME
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [savedStudyNotes, setSavedStudyNotes] = useState<StudyNote[]>([]);
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);
  const [localAuthLoading, setLocalAuthLoading] = useState(false);

  // Real user and settings templates for Firebase readiness
  const [user, setUser] = useState<User>({
    id: '',
    name: 'Kushana Vachaki',
    email: 'kushanavachaki@gmail.com',
    studyLevel: 'Medical Student',
    subjects: ['Human Anatomy', 'Pathology', 'Cellular Physiology'],
    bio: 'Medical scholar specializing in cardiac pathophysiology and systemic metabolic pathways.',
    createdAt: new Date()
  });

  const [settings, setSettings] = useState<UserSettings>({
    userId: '',
    answerStyle: 'academic',
    examOriented: true,
    responseType: 'detailed',
    allowExtraInfo: true,
    sourceVisibility: 'always',
    theme: 'light',
    studyReminders: true,
    revisionReminders: true,
    vivaReminders: false
  });

  const [isAiAnswering, setIsAiAnswering] = useState<boolean>(false);

  const [ragDiagnostics, setRagDiagnostics] = useState<{
    pdfReceived?: boolean;
    textExtracted?: boolean;
    charCount?: number;
    chunksCreated?: boolean;
    chunkCount?: number;
    embeddingsGenerated?: boolean;
    embeddingCount?: number;
    firestoreStorage?: boolean;
    storageCount?: number;
    retrieval?: boolean;
    chunksRetrievedCount?: number;
    geminiGeneration?: boolean;
    lastQuestion?: string;
    previews?: string[];
    groundedStatus?: "study_material" | "fallback_knowledge" | "idle";
    errorStage?: string;
    errorMessage?: string;
  }>({
    groundedStatus: "idle"
  });

  const [showDiagPanel, setShowDiagPanel] = useState<boolean>(true);
  const [showChunkPreviews, setShowChunkPreviews] = useState<boolean>(false);

  // Listen for real Firebase auth state changes
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          let cachedUser: any = {};
          try {
            const data = localStorage.getItem('knowva_user_v3');
            if (data) cachedUser = JSON.parse(data);
          } catch (e) {}

          setUser({
            id: currentUser.uid,
            name: currentUser.displayName || cachedUser.name || 'Kushana Vachaki',
            email: currentUser.email || cachedUser.email || 'kushanavachaki@gmail.com',
            studyLevel: cachedUser.studyLevel || 'Medical Student',
            subjects: cachedUser.subjects || ['Human Anatomy', 'Pathology', 'Cellular Physiology'],
            bio: cachedUser.bio || 'Medical scholar specializing in cardiac pathophysiology and systemic metabolic pathways.',
            createdAt: cachedUser.createdAt ? new Date(cachedUser.createdAt) : new Date()
          });
          setSettings(prev => ({ ...prev, userId: currentUser.uid }));
          setAuthError(null);
          setAuthLoading(false);
        } else {
          setUser(prev => ({ ...prev, id: '' }));
          setSettings(prev => ({ ...prev, userId: '' }));
          setAuthError(null);
          setAuthLoading(false);
        }
      } catch (err: any) {
        if (import.meta.env.DEV) {
          console.log("Firebase Auth state info:", err);
        }
        setAuthError("An unexpected authentication error occurred. Please check your connection and reload.");
        setAuthLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setLocalAuthError(null);
      setLocalAuthLoading(true);
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      setUser(prev => ({
        ...prev,
        id: cred.user.uid,
        email: cred.user.email || prev.email,
        name: cred.user.displayName || prev.name
      }));
      setSettings(prev => ({ ...prev, userId: cred.user.uid }));
      setAuthError(null);
    } catch (err: any) {
      console.error("Google Sign-In failed:", err);
      setLocalAuthError(err.message || "Google Authentication failed. Please try again.");
    } finally {
      setLocalAuthLoading(false);
    }
  };

  // Live real-time Firestore synchronization listeners
  useEffect(() => {
    if (authLoading || !user.id) return;

    // 1. Documents Sync
    const qDocs = query(collection(db, "documents"), where("userId", "==", user.id));
    const unsubscribeDocs = onSnapshot(qDocs, (snapshot) => {
      const docs: StudyMaterial[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        docs.push({
          id: docSnap.id,
          userId: data.userId,
          type: data.type,
          name: data.title,
          content: data.content,
          fileSize: data.fileSize || `${Math.round((data.content || '').length / 1024)} KB`,
          pageCount: data.pageCount,
          uploadedAt: new Date(data.createdAt || Date.now())
        });
      });
      docs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
      setMaterials(docs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "documents");
    });

    // 2. Study Notes Sync
    if (import.meta.env.DEV) {
      console.log("[DIAGNOSTIC] Initiating notes collection subscription...");
    }
    const qNotes = query(collection(db, "notes"), where("userId", "==", user.id));
    const unsubscribeNotes = onSnapshot(qNotes, (snapshot) => {
      if (import.meta.env.DEV) {
        console.log("[DIAGNOSTIC] Notes collection queried ✓ (Snapshot trigger received with " + snapshot.size + " docs)");
      }
      const notes: StudyNote[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        notes.push({
          id: docSnap.id,
          userId: data.userId,
          title: data.title,
          summary: data.summary,
          keyConcepts: data.keyConcepts || [],
          definitions: data.definitions || [],
          mechanisms: data.mechanisms || [],
          examPoints: data.examPoints || [],
          memoryCues: data.memoryCues || [],
          vivaQuestions: data.vivaQuestions || [],
          sourceTitle: data.sourceTitle || 'General Knowledge',
          createdAt: new Date(data.createdAt || Date.now()),
          isFavorite: !!data.isFavorite
        });
      });
      notes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      if (import.meta.env.DEV) {
        if (notes.length > 0) {
          console.log("[DIAGNOSTIC] Saved Study Card found ✓ (Total loaded cards in app state: " + notes.length + ")");
        } else {
          console.log("[DIAGNOSTIC] Saved Study Card found ✗ (No cards currently match filters in Firestore collection 'notes')");
        }
      }

      setSavedStudyNotes(notes);
    }, (err) => {
      if (import.meta.env.DEV) {
        console.error("[DIAGNOSTIC] Notes collection queried ✗ (Snapshot subscription failed: " + err.message + ")");
      }
      handleFirestoreError(err, OperationType.LIST, "notes");
    });

    // 3. Conversation Messages Sync
    const qMessages = query(collection(db, "messages"), where("userId", "==", user.id));
    const unsubscribeMessages = onSnapshot(qMessages, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        msgs.push({
          id: docSnap.id,
          sender: data.sender,
          text: data.text,
          timestamp: new Date(data.timestamp || Date.now()),
          sources: data.sources,
          isExtraInfo: data.isExtraInfo
        });
      });
      msgs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      setMessages(msgs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "messages");
    });

    // Sync profiles and preferences from localStorage as standard client-only settings
    try {
      const savedUser = localStorage.getItem('knowva_user_v3');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        setUser(prev => ({
          ...parsed,
          id: prev.id, // Keep authoritative Firebase auth UID
          createdAt: new Date(parsed.createdAt || Date.now())
        }));
      }

      const savedSettings = localStorage.getItem('knowva_settings_v3');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        setSettings(prev => ({
          ...parsedSettings,
          userId: prev.userId // Keep authoritative Firebase auth UID
        }));
      }
    } catch (e) {
      console.error("Error loading offline user profiles:", e);
    }

    return () => {
      unsubscribeDocs();
      unsubscribeNotes();
      unsubscribeMessages();
    };
  }, [user.id, authLoading]);

  // Firestore & API active mutators
  const handleAddMaterial = (newMaterial: StudyMaterial) => {
    // We already let StudyMaterialSection post the document directly, 
    // but we can add this fallback updater for maximum consistency.
    if (import.meta.env.DEV) {
      console.log("Indexed document synchronized to UI");
    }
  };

  const handleRemoveMaterial = async (id: string) => {
    if (!confirm("Are you sure you want to unindex this study material? This will remove all its semantic search structures.")) {
      return;
    }
    try {
      // Delete document metadata
      await deleteDoc(doc(db, "documents", id));

      // Delete associated vector chunks
      const qChunks = query(collection(db, "chunks"), where("documentId", "==", id));
      const chunksSnap = await getDocs(qChunks);
      const deletePromises: Promise<any>[] = [];
      chunksSnap.forEach((cSnap) => {
        deletePromises.push(deleteDoc(doc(db, "chunks", cSnap.id)));
      });
      await Promise.all(deletePromises);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `documents/${id}`);
    }
  };

  const handleSaveStudyNote = async (newNote: StudyNote) => {
    const path = "notes";
    if (import.meta.env.DEV) {
      console.log("[DIAGNOSTIC] Firestore save attempted ✓ (Path: 'notes')");
    }
    try {
      const docRef = await addDoc(collection(db, path), {
        userId: user.id,
        title: newNote.title,
        summary: newNote.summary,
        keyConcepts: newNote.keyConcepts,
        definitions: newNote.definitions,
        mechanisms: newNote.mechanisms,
        examPoints: newNote.examPoints,
        memoryCues: newNote.memoryCues,
        vivaQuestions: newNote.vivaQuestions,
        sourceTitle: newNote.sourceTitle,
        createdAt: new Date().toISOString(),
        isFavorite: false
      });
      if (import.meta.env.DEV) {
        console.log("[DIAGNOSTIC] Firestore save succeeded ✓ (Document ID: " + docRef.id + ")");
      }

      // Log activity
      await addDoc(collection(db, "activity"), {
        userId: user.id,
        type: "note_created",
        description: `Created study note "${newNote.title}"`,
        timestamp: new Date().toISOString()
      });
    } catch (e: any) {
      if (import.meta.env.DEV) {
        console.error("[DIAGNOSTIC] Firestore save attempted ✗ (Failed to add doc to collection: " + e.message + ")");
      }
      handleFirestoreError(e, OperationType.CREATE, path);
    }
  };

  const handleRemoveStudyNote = async (id: string) => {
    try {
      await deleteDoc(doc(db, "notes", id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `notes/${id}`);
    }
  };

  const handleToggleFavoriteNote = async (id: string) => {
    try {
      const noteSnap = savedStudyNotes.find(n => n.id === id);
      if (noteSnap) {
        await updateDoc(doc(db, "notes", id), {
          isFavorite: !noteSnap.isFavorite
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `notes/${id}`);
    }
  };

  // Profile preferences
  const handleUpdateUser = (updatedUserFields: Partial<User>) => {
    const updated = { ...user, ...updatedUserFields };
    setUser(updated);
    localStorage.setItem('knowva_user_v3', JSON.stringify(updated));
  };

  const handleUpdateSettings = (updatedSettingsFields: Partial<UserSettings>) => {
    const updated = { ...settings, ...updatedSettingsFields };
    setSettings(updated);
    localStorage.setItem('knowva_settings_v3', JSON.stringify(updated));
  };

  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out of your Knowva study session?")) {
      try {
        await signOut(auth);
        setActiveTab('home');
      } catch (e: any) {
        console.error("Sign-out failed:", e);
      }
    }
  };

  // Real-time Chat RAG Pipeline Action
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isAiAnswering) return;

    setIsAiAnswering(true);

    try {
      // 1. Instantly post User question to Firestore
      const userMsgDoc = {
        userId: user.id,
        sender: 'user',
        text: text.trim(),
        timestamp: new Date().toISOString()
      };
      await addDoc(collection(db, "messages"), userMsgDoc);

      // 2. Fetch history of last 4 chat logs for conversation contextual flow
      const conversationHistory = messages.slice(-4).map((m) => ({
        sender: m.sender,
        text: m.text
      }));

      // 3. Post to custom Express backend API with 60s timeout
      const res = await fetchWithTimeout("/api/chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text.trim(),
          history: conversationHistory,
          userId: user.id
        })
      }, 60000);

      if (!res.ok) {
        const errData = await res.json();
        if (errData.errorStage) {
          setRagDiagnostics(prev => ({
            ...prev,
            errorStage: errData.errorStage,
            errorMessage: errData.error
          }));
        }
        throw new Error(errData.error || `RAG answering request failed at stage: ${errData.errorStage || "UNKNOWN"}`);
      }

      const data = await res.json();

      if (data.diagnostics) {
        setRagDiagnostics(prev => ({
          ...prev,
          ...data.diagnostics,
          errorStage: undefined,
          errorMessage: undefined
        }));
      }

      // 4. Post Assistant response to Firestore
      const assistantMsgDoc = {
        userId: user.id,
        sender: 'assistant',
        text: data.answer,
        sources: data.sources || [],
        isExtraInfo: !!data.isExtraInfo,
        timestamp: new Date().toISOString()
      };
      await addDoc(collection(db, "messages"), assistantMsgDoc);

    } catch (err: any) {
      console.error("RAG pipeline chat error: ", err);
      // Post error notification directly to stream
      await addDoc(collection(db, "messages"), {
        userId: user.id,
        sender: 'system',
        text: `Pipeline Error: ${err.message || "Failed to query study content. Check system connection."}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsAiAnswering(false);
    }
  };

  const handleClearChat = () => {
    setShowClearModal(true);
  };

  const confirmClearChat = async () => {
    setShowClearModal(false);
    try {
      const q = query(collection(db, "messages"), where("userId", "==", user.id));
      const snap = await getDocs(q);
      const deletePromises: Promise<any>[] = [];
      snap.forEach((docSnap) => {
        deletePromises.push(deleteDoc(doc(db, "messages", docSnap.id)));
      });
      await Promise.all(deletePromises);
    } catch (e) {
      console.error("Failed to clear chat stream:", e);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center space-y-4 font-sans text-center">
        <div className="h-12 w-12 bg-gradient-to-tr from-sky-500 to-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/20 animate-pulse">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <p className="text-xs font-bold text-slate-600">Initializing Knowva Study Workspace...</p>
      </div>
    );
  }

  if (!user.id) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 font-sans text-center">
        <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-6">
          
          {/* Header & Logo */}
          <div className="space-y-2 text-center">
            <div className="h-12 w-12 bg-gradient-to-tr from-sky-500 to-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-sky-500/10">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-black text-slate-800">Welcome to Knowva</h2>
            <p className="text-xs text-slate-400 font-medium leading-relaxed">
              Your intelligent syllabus-grounded medical companion.
            </p>
          </div>

          {/* Error Feedback */}
          {(localAuthError || authError) && (
            <div className="bg-rose-50 border border-rose-100/80 rounded-2xl p-3 text-left">
              <p className="text-[10px] text-rose-600 font-bold leading-relaxed whitespace-pre-line">
                {localAuthError || authError}
              </p>
            </div>
          )}

          {/* Email / Password Form */}
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              setLocalAuthError(null);
              setLocalAuthLoading(true);
              try {
                if (isRegisterMode) {
                  await createUserWithEmailAndPassword(auth, authEmail, authPassword);
                } else {
                  await signInWithEmailAndPassword(auth, authEmail, authPassword);
                }
              } catch (err: any) {
                console.error("Authentication failed:", err);
                setLocalAuthError(err.message || "Authentication failed. Please verify your credentials.");
              } finally {
                setLocalAuthLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-3.5 text-xs">
              <div className="space-y-1 text-left">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider pl-1">Email Address</label>
                <input 
                  type="email" 
                  value={authEmail} 
                  required
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@university.edu"
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-semibold"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider pl-1">Password</label>
                <input 
                  type="password" 
                  value={authPassword} 
                  required
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-semibold"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={localAuthLoading}
              className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-sky-500/10 cursor-pointer disabled:opacity-50"
            >
              {localAuthLoading ? "Processing..." : (isRegisterMode ? "Create Account" : "Sign In")}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-[10px] font-bold text-slate-400">OR</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Social Google SignIn */}
          <button 
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm cursor-pointer"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.102 1.025 5.043 1.926l3.227-3.11c-2.071-1.926-4.957-3.11-8.27-3.11-6.627 0-12 5.373-12 12s5.373 12 12 12c6.923 0 11.52-4.843 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z"/>
            </svg>
            Continue with Google
          </button>

          {/* Switch Register/Login Mode */}
          <div className="pt-2 text-center">
            <button 
              type="button"
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setLocalAuthError(null);
              }}
              className="text-xs text-sky-600 font-bold hover:underline transition-all"
            >
              {isRegisterMode ? "Already have an account? Sign In" : "Don't have an account? Create Account"}
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-700 flex flex-col antialiased pb-16 md:pb-0 font-sans">
      
      {/* Custom Clear Dialogue Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-white border border-slate-100 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-left font-sans"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Clear Study Dialogue?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              The current conversation will be removed from the active study workspace, while saved notes and study materials remain safe.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearChat}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                Clear Dialogue
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Dynamic responsive navigation header */}
      <Header 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        materialsCount={materials.length} 
      />

      {/* Main Study Workspace Area */}
      <main className="flex-1 flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 min-h-0">
        
        {/* HOME DASHBOARD */}
        {activeTab === 'home' && (
          <HomeSection 
            userName={user.name}
            materials={materials}
            savedStudyNotes={savedStudyNotes}
            messages={messages}
            onNavigate={setActiveTab}
            onOpenQuickUpload={() => setActiveTab('ask')}
            onOpenQuickNote={() => setActiveTab('ask')}
          />
        )}

        {/* ASK INTERACTIVE WORKSPACE */}
        {activeTab === 'ask' && (
          <div className="flex flex-col gap-4 sm:gap-5 flex-1 min-h-0 max-w-3xl mx-auto w-full">
            
            {/* Header concept banner */}
            <div className="flex items-center justify-between gap-4 p-4 bg-white border border-slate-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.015)] text-left">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-violet-50 text-violet-600 border border-violet-100 rounded-xl">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="space-y-0.5">
                  <h1 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-widest">STUDY WORKSPACE</h1>
                  <p className="text-[10px] text-slate-500 font-medium">Your study material. Your questions. Your progress.</p>
                </div>
              </div>

              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-[10px] font-bold rounded-xl text-slate-500 transition-all cursor-pointer border border-slate-200/60"
                >
                  Clear Dialogue
                </button>
              )}
            </div>

            {/* Compact upload controls */}
            <StudyMaterialSection 
              userId={user.id}
              materials={materials}
              onAddMaterial={(material, ingestionDiag) => {
                handleAddMaterial(material);
                if (ingestionDiag) {
                  setRagDiagnostics(prev => ({
                    ...prev,
                    ...ingestionDiag,
                    retrieval: undefined,
                    chunksRetrievedCount: undefined,
                    previews: undefined,
                    groundedStatus: "idle",
                    lastQuestion: undefined
                  }));
                }
              }}
              onRemoveMaterial={handleRemoveMaterial}
            />

            {/* Chat Area */}
            <div className="flex-1 bg-white border border-slate-100 rounded-2xl flex flex-col min-h-[420px] overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.01)]">
              <ChatSection 
                userId={user.id}
                materials={materials}
                messages={messages}
                onSendMessage={handleSendMessage}
                onSaveStudyNote={handleSaveStudyNote}
                isAiAnswering={isAiAnswering}
              />
            </div>

          </div>
        )}

        {/* SMART REVISION */}
        {activeTab === 'revision' && (
          <SmartRevisionSection 
            userId={user.id}
            materials={materials} 
            onBack={() => setActiveTab('home')}
          />
        )}

        {/* VIVA */}
        {activeTab === 'viva' && (
          <PlaceholderSection 
            type="viva" 
            userId={user?.id || 'guest_user'}
            uploadedMaterials={materials}
            savedStudyNotes={savedStudyNotes}
            onRemoveStudyNote={handleRemoveStudyNote}
            onNavigateToAsk={() => setActiveTab('ask')}
            messagesCount={messages.filter(m => m.sender === 'user').length}
          />
        )}

        {/* PROGRESS */}
        {activeTab === 'progress' && (
          <PlaceholderSection 
            type="progress" 
            uploadedMaterials={materials}
            savedStudyNotes={savedStudyNotes}
            onRemoveStudyNote={handleRemoveStudyNote}
            onNavigateToAsk={() => setActiveTab('ask')}
            messagesCount={messages.filter(m => m.sender === 'user').length}
            messages={messages}
          />
        )}

        {/* NOTES LIBRARY */}
        {activeTab === 'notes' && (
          <PlaceholderSection 
            type="notes" 
            uploadedMaterials={materials}
            savedStudyNotes={savedStudyNotes}
            onRemoveStudyNote={handleRemoveStudyNote}
            onToggleFavoriteNote={handleToggleFavoriteNote}
            onNavigateToAsk={() => setActiveTab('ask')}
            messagesCount={messages.filter(m => m.sender === 'user').length}
          />
        )}

        {/* PROFILE CONFIG */}
        {activeTab === 'profile' && (
          <ProfileSection 
            user={user}
            settings={settings}
            onUpdateUser={handleUpdateUser}
            onUpdateSettings={handleUpdateSettings}
            onSignOut={handleSignOut}
            onNavigate={setActiveTab}
            uploadedCount={materials.length}
            notesCount={savedStudyNotes.length}
          />
        )}

      </main>
    </div>
  );
}
