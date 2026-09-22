/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import HomeSection from './components/HomeSection';
import StudyMaterialSection from './components/StudyMaterialSection';
import ChatSection from './components/ChatSection';
import PlaceholderSection from './components/PlaceholderSection';
import ProfileSection from './components/ProfileSection';
import { TabType, StudyMaterial, Message, StudyNote, User, UserSettings } from './types';
import { Sparkles, Activity, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Database, Cpu, Brain, Check, Info } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
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

  // Real user and settings templates for Firebase readiness
  const [user, setUser] = useState<User>({
    id: 'u-temp-123',
    name: 'Kushana Vachaki',
    email: 'kushanavachaki@gmail.com',
    studyLevel: 'Medical Student',
    subjects: ['Human Anatomy', 'Pathology', 'Cellular Physiology'],
    bio: 'Medical scholar specializing in cardiac pathophysiology and systemic metabolic pathways.',
    createdAt: new Date()
  });

  const [settings, setSettings] = useState<UserSettings>({
    userId: 'u-temp-123',
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

  // Live real-time Firestore synchronization listeners
  useEffect(() => {
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
    console.log("[DIAGNOSTIC] Initiating notes collection subscription...");
    const qNotes = query(collection(db, "notes"), where("userId", "==", user.id));
    const unsubscribeNotes = onSnapshot(qNotes, (snapshot) => {
      console.log("[DIAGNOSTIC] Notes collection queried ✓ (Snapshot trigger received with " + snapshot.size + " docs)");
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
      
      if (notes.length > 0) {
        console.log("[DIAGNOSTIC] Saved Study Card found ✓ (Total loaded cards in app state: " + notes.length + ")");
      } else {
        console.log("[DIAGNOSTIC] Saved Study Card found ✗ (No cards currently match filters in Firestore collection 'notes')");
      }

      setSavedStudyNotes(notes);
    }, (err) => {
      console.error("[DIAGNOSTIC] Notes collection queried ✗ (Snapshot subscription failed: " + err.message + ")");
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
        setUser({
          ...parsed,
          createdAt: new Date(parsed.createdAt)
        });
      }

      const savedSettings = localStorage.getItem('knowva_settings_v3');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch (e) {
      console.error("Error loading offline user profiles:", e);
    }

    return () => {
      unsubscribeDocs();
      unsubscribeNotes();
      unsubscribeMessages();
    };
  }, [user.id]);

  // Firestore & API active mutators
  const handleAddMaterial = (newMaterial: StudyMaterial) => {
    // We already let StudyMaterialSection post the document directly, 
    // but we can add this fallback updater for maximum consistency.
    console.log("Indexed document synchronized to UI: ", newMaterial.name);
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
    console.log("[DIAGNOSTIC] Firestore save attempted ✓ (Path: 'notes' for userId: '" + user.id + "')");
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
      console.log("[DIAGNOSTIC] Firestore save succeeded ✓ (Document ID: " + docRef.id + ")");

      // Log activity
      await addDoc(collection(db, "activity"), {
        userId: user.id,
        type: "note_created",
        description: `Created study note "${newNote.title}"`,
        timestamp: new Date().toISOString()
      });
    } catch (e: any) {
      console.error("[DIAGNOSTIC] Firestore save attempted ✗ (Failed to add doc to collection: " + e.message + ")");
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

  const handleSignOut = () => {
    if (confirm("Sign out of current local session? (Offline metrics will remain in local database sandbox)")) {
      setActiveTab('home');
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

      // 2. Fetch history of last 8 chat logs for conversation contextual flow
      const conversationHistory = messages.slice(-8).map((m) => ({
        sender: m.sender,
        text: m.text
      }));

      // 3. Post to custom Express dev/production backend API
      const res = await fetch("/api/chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text.trim(),
          history: conversationHistory,
          userId: user.id
        })
      });

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

  const handleClearChat = async () => {
    if (!confirm("Clear active study dialogue?")) {
      return;
    }
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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-700 flex flex-col antialiased pb-16 md:pb-0 font-sans">
      
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

            {/* RAG REAL-TIME DIAGNOSTIC PANEL */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.015)] space-y-3 font-sans">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Activity className="h-4 w-4 text-sky-500 animate-pulse" />
                  <span>🛠️ RAG PIPELINE DIAGNOSTICS (REAL-TIME)</span>
                </div>
                <button 
                  onClick={() => setShowDiagPanel(!showDiagPanel)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition-all cursor-pointer"
                >
                  {showDiagPanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>

              {showDiagPanel && (
                <div className="space-y-3.5">
                  {/* Pipeline Errors */}
                  {ragDiagnostics.errorStage && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-[10px] text-rose-700 font-semibold space-y-1">
                      <div className="flex items-center gap-1 text-xs text-rose-800 font-bold uppercase tracking-wider">
                        <AlertTriangle className="h-4 w-4" />
                        <span>PIPELINE FAILURE STAGE: {ragDiagnostics.errorStage}</span>
                      </div>
                      <p>{ragDiagnostics.errorMessage || "An unexpected error occurred in the RAG pipeline."}</p>
                    </div>
                  )}

                  {/* Flow Steps Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Ingestion status */}
                    <div className="p-3.5 bg-slate-50/50 border border-slate-100/60 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 border-b border-slate-100 pb-1.5">
                        <Database className="h-3.5 w-3.5 text-sky-500" />
                        <span>1. Indexing & Storage Ingest</span>
                      </div>
                      <ul className="space-y-1.5 text-[10px] text-slate-500 font-medium">
                        <li className="flex items-center justify-between">
                          <span>PDF Received:</span>
                          <span className="font-extrabold flex items-center gap-1">
                            {ragDiagnostics.pdfReceived ? (
                              <span className="text-emerald-600 flex items-center gap-0.5"><Check className="h-3 w-3" /> Yes</span>
                            ) : <span className="text-slate-400">—</span>}
                          </span>
                        </li>
                        <li className="flex items-center justify-between">
                          <span>Text Extracted:</span>
                          <span className="font-extrabold flex items-center gap-1">
                            {ragDiagnostics.textExtracted ? (
                              <span className="text-emerald-600 flex items-center gap-0.5"><Check className="h-3 w-3" /> {ragDiagnostics.charCount} chars</span>
                            ) : <span className="text-slate-400">—</span>}
                          </span>
                        </li>
                        <li className="flex items-center justify-between">
                          <span>Chunks Created:</span>
                          <span className="font-extrabold flex items-center gap-1">
                            {ragDiagnostics.chunksCreated ? (
                              <span className="text-emerald-600 flex items-center gap-0.5"><Check className="h-3 w-3" /> {ragDiagnostics.chunkCount} chunks</span>
                            ) : <span className="text-slate-400">—</span>}
                          </span>
                        </li>
                        <li className="flex items-center justify-between">
                          <span>Embeddings Generated:</span>
                          <span className="font-extrabold flex items-center gap-1">
                            {ragDiagnostics.embeddingsGenerated ? (
                              <span className="text-emerald-600 flex items-center gap-0.5"><Check className="h-3 w-3" /> {ragDiagnostics.embeddingCount} vectors</span>
                            ) : <span className="text-slate-400">—</span>}
                          </span>
                        </li>
                        <li className="flex items-center justify-between">
                          <span>Firestore Storage Path:</span>
                          <span className="font-extrabold flex items-center gap-1">
                            {ragDiagnostics.firestoreStorage ? (
                              <span className="text-sky-600 flex items-center gap-0.5"><Database className="h-3 w-3" /> /chunks</span>
                            ) : <span className="text-slate-400">—</span>}
                          </span>
                        </li>
                      </ul>
                    </div>

                    {/* Retrieval status */}
                    <div className="p-3.5 bg-slate-50/50 border border-slate-100/60 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 border-b border-slate-100 pb-1.5">
                        <Brain className="h-3.5 w-3.5 text-sky-500" />
                        <span>2. Semantics & Context Query</span>
                      </div>
                      <ul className="space-y-1.5 text-[10px] text-slate-500 font-medium">
                        <li className="flex flex-col gap-0.5">
                          <span>Last Searched Question:</span>
                          <span className="font-bold text-slate-700 truncate block max-w-full italic">
                            {ragDiagnostics.lastQuestion ? `"${ragDiagnostics.lastQuestion}"` : "None yet"}
                          </span>
                        </li>
                        <li className="flex items-center justify-between">
                          <span>Similarity Model:</span>
                          <span className="font-extrabold text-slate-600">gemini-embedding-2</span>
                        </li>
                        <li className="flex items-center justify-between">
                          <span>Retrieved Chunk Count:</span>
                          <span className="font-extrabold flex items-center gap-1">
                            {ragDiagnostics.chunksRetrievedCount !== undefined ? (
                              <span className="text-emerald-600 flex items-center gap-0.5"><Check className="h-3 w-3" /> {ragDiagnostics.chunksRetrievedCount} chunks</span>
                            ) : <span className="text-slate-400">—</span>}
                          </span>
                        </li>
                        <li className="flex items-center justify-between">
                          <span>Grounding Output Status:</span>
                          <span className="font-extrabold flex items-center gap-1">
                            {ragDiagnostics.groundedStatus === "study_material" ? (
                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded text-[9px]">📚 Grounded in Syllabus</span>
                            ) : ragDiagnostics.groundedStatus === "fallback_knowledge" ? (
                              <span className="bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded text-[9px]">⚠️ Fallback Supplemental</span>
                            ) : <span className="text-slate-400">—</span>}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Chunks preview list */}
                  {ragDiagnostics.previews && ragDiagnostics.previews.length > 0 && (
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <button 
                        onClick={() => setShowChunkPreviews(!showChunkPreviews)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-700 transition-colors cursor-pointer text-left"
                      >
                        <span className="flex items-center gap-1">
                          <Cpu className="h-3.5 w-3.5 text-sky-500" />
                          <span>Inspect Retrieved Text Chunks ({ragDiagnostics.previews.length})</span>
                        </span>
                        {showChunkPreviews ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>

                      {showChunkPreviews && (
                        <div className="p-2 bg-white space-y-2 border-t border-slate-100 divide-y divide-slate-50 max-h-48 overflow-y-auto">
                          {ragDiagnostics.previews.map((preview, i) => (
                            <div key={i} className="pt-2 first:pt-0 text-[9px] text-slate-600 font-medium leading-relaxed font-sans">
                              {preview}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>

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

        {/* VIVA */}
        {activeTab === 'viva' && (
          <PlaceholderSection 
            type="viva" 
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
