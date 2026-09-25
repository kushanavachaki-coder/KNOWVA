/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithTimeout } from '../utils/apiTimeout';
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  BookOpen, 
  FileText, 
  Sparkles, 
  FileEdit, 
  Check, 
  Info,
  ArrowRight,
  Bookmark,
  X,
  FileCheck2,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { Message, StudyMaterial, StudyNote } from '../types';

interface ChatSectionProps {
  userId: string;
  materials: StudyMaterial[];
  messages: Message[];
  onSendMessage: (text: string) => void;
  onSaveStudyNote: (note: StudyNote) => void;
  isAiAnswering: boolean;
}

export default function ChatSection({ 
  userId,
  materials, 
  messages, 
  onSendMessage,
  onSaveStudyNote,
  isAiAnswering
}: ChatSectionProps) {
  const [inputText, setInputText] = useState<string>('');
  const [activeCreatorMessage, setActiveCreatorMessage] = useState<Message | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState<boolean>(false);
  const [compilingNoteId, setCompilingNoteId] = useState<string | null>(null);

  const handleCreateStudyNoteDirect = async (msg: Message) => {
    if (import.meta.env.DEV) {
      console.log("[DIAGNOSTIC] Create Study Notes clicked ✓");
    }
    if (compilingNoteId) {
      if (import.meta.env.DEV) {
        console.log("[DIAGNOSTIC] Create Study Notes clicked ✗ (Already compiling)");
      }
      return;
    }
    setCompilingNoteId(msg.id);

    // Verify if source answer exists
    if (import.meta.env.DEV) {
      if (!msg || !msg.text) {
        console.error("[DIAGNOSTIC] Source answer received ✗ (Message text is missing/empty)");
      } else {
        console.log("[DIAGNOSTIC] Source answer received ✓ (Message content length: " + msg.text.length + " characters)");
      }
    }

    try {
      // Find matching question
      const msgIndex = messages.findIndex(m => m.id === msg.id);
      let questionText = "Study Topic Review";
      if (msgIndex > 0) {
        for (let i = msgIndex - 1; i >= 0; i--) {
          if (messages[i].sender === 'user') {
            questionText = messages[i].text;
            break;
          }
        }
      }

      if (import.meta.env.DEV) {
        console.log("[DIAGNOSTIC] Study-note generation started ✓ (Querying backend compile API /api/notes/generate)");
      }
      const res = await fetchWithTimeout("/api/notes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          answer: msg.text,
          sources: msg.sources || [],
          userId: userId
        })
      }, 60000);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || `HTTP ${res.status} ${res.statusText}`;
        if (import.meta.env.DEV) {
          console.error("[DIAGNOSTIC] Study-note generation completed ✗ (API returned error: " + errMsg + ")");
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      if (import.meta.env.DEV) {
        console.log("[DIAGNOSTIC] Study-note generation completed ✓ (API succeeded)");
      }

      if (data.success && data.note) {
        const note = data.note;
        
        // Verify generated note contains actual content
        if (import.meta.env.DEV) {
          const hasContent = note.title && note.summary;
          if (hasContent) {
            console.log("[DIAGNOSTIC] Generated note contains actual content ✓ (Summary length: " + note.summary.length + ")");
          } else {
            console.warn("[DIAGNOSTIC] Generated note contains actual content ✗ (Generated fields are missing or empty)");
          }
        }

        setNoteTitle(note.title || `Study Notes: ${questionText}`);
        setNoteSummary(note.summary || "");
        setNoteConcepts(Array.isArray(note.keyConcepts) ? note.keyConcepts.join(", ") : "");
        setNoteDefinitions(Array.isArray(note.definitions) ? note.definitions.map((d: any) => `${d.term}: ${d.definition}`).join("\n") : "");
        setNoteMechanisms(Array.isArray(note.mechanisms) ? note.mechanisms.join("\n") : "");
        setNoteExamPoints(Array.isArray(note.examPoints) ? note.examPoints.join("\n") : "");
        setNoteMemoryCues(Array.isArray(note.memoryCues) ? note.memoryCues.join("\n") : "");
        setNoteVivaQuestions(Array.isArray(note.vivaQuestions) ? note.vivaQuestions.join("\n") : "");
        
        // Open the Save to Study Notes popup!
        setActiveCreatorMessage(msg);
        if (import.meta.env.DEV) {
          console.log("[DIAGNOSTIC] Save dialog opened ✓ (Active creator state is set to show UI modal)");
        }
      } else {
        if (import.meta.env.DEV) {
          console.error("[DIAGNOSTIC] Generated note contains actual content ✗ (Response data format was invalid or lacked note fields)");
        }
      }
    } catch (err: any) {
      if (import.meta.env.DEV) {
        console.error("[DIAGNOSTIC] Study-note generation started ✗ (Exception occurred: " + err.message + ")");
        console.error(err);
      }
      alert(err.message || "Could not compile study card automatically.");
    } finally {
      setCompilingNoteId(null);
    }
  };

  // Note creator state
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [noteSummary, setNoteSummary] = useState<string>('');
  const [noteConcepts, setNoteConcepts] = useState<string>('');
  const [noteDefinitions, setNoteDefinitions] = useState<string>('');
  const [noteMechanisms, setNoteMechanisms] = useState<string>('');
  const [noteExamPoints, setNoteExamPoints] = useState<string>('');
  const [noteMemoryCues, setNoteMemoryCues] = useState<string>('');
  const [noteVivaQuestions, setNoteVivaQuestions] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    "Explain this concept simply",
    "Give me exam-ready notes",
    "What are the key points here?",
    "Test my understanding"
  ];

  const handleSuggestionClick = (suggestion: string) => {
    let textToSend = suggestion;
    if (materials.length > 0) {
      textToSend = `${suggestion} based on "${materials[materials.length - 1].name}"`;
    } else {
      textToSend = `${suggestion} (Please ask me to upload notes)`;
    }
    onSendMessage(textToSend);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Open note creator wizard
  const handleOpenCreator = (msg: Message) => {
    setActiveCreatorMessage(msg);
    setNoteTitle(materials.length > 0 ? `Study Notes: ${materials[materials.length - 1].name}` : "Study Notes: Cellular Metabolism");
    setNoteSummary('');
    setNoteConcepts('');
    setNoteDefinitions('');
    setNoteMechanisms('');
    setNoteExamPoints('');
    setNoteMemoryCues('');
    setNoteVivaQuestions('');
  };

  // Populate model draft to showcase visual layout of notes before saving
  const handlePopulateModelDraft = () => {
    setNoteTitle("Study Notes: Cellular Respiration");
    setNoteSummary("Cellular respiration is the metabolic process by which cells convert biochemical energy from nutrients into adenosine triphosphate (ATP), releasing waste products.");
    setNoteConcepts("Glycolysis, Krebs Cycle, Electron Transport Chain (ETC)");
    setNoteDefinitions("ATP: Adenosine Triphosphate, energy currency of cell.\nOxidative Phosphorylation: Synthesis of ATP driven by proton gradient.");
    setNoteMechanisms("Protons are pumped across the inner mitochondrial membrane into the intermembrane space, building a high concentration gradient. Protons flow back through ATP Synthase, driving the phosphorylation of ADP.");
    setNoteExamPoints("1. Glycolysis occurs in cytosol; yields 2 net ATP.\n2. Krebs cycle occurs in mitochondrial matrix; yields 2 ATP.\n3. ETC yields ~32 ATP; oxygen is final electron acceptor.");
    setNoteMemoryCues("ETC = Energy Transfer Chain (Requires Oxygen to keep the chain flowing).");
    setNoteVivaQuestions("Explain how cellular respiration stops in the absence of oxygen.");
  };

  // Save compiled note to Notes library
  const handleSaveNoteToLibrary = () => {
    if (!noteTitle.trim()) return;

    const newNote: StudyNote = {
      id: Math.random().toString(36).substring(7),
      userId: userId,
      title: noteTitle.trim(),
      summary: noteSummary.trim() || "No summary provided.",
      keyConcepts: noteConcepts.trim() ? noteConcepts.split(',').map(s => s.trim()) : [],
      definitions: noteDefinitions.trim() ? noteDefinitions.split('\n').map(line => {
        const parts = line.split(':');
        return {
          term: parts[0]?.trim() || "Term",
          definition: parts[1]?.trim() || "Definition"
        };
      }) : [],
      mechanisms: noteMechanisms.trim() ? [noteMechanisms.trim()] : [],
      examPoints: noteExamPoints.trim() ? noteExamPoints.split('\n').map(s => s.trim()) : [],
      memoryCues: noteMemoryCues.trim() ? [noteMemoryCues.trim()] : [],
      vivaQuestions: noteVivaQuestions.trim() ? [noteVivaQuestions.trim()] : [],
      sourceTitle: materials.length > 0 ? materials[materials.length - 1].name : "General Knowledge",
      createdAt: new Date(),
      isFavorite: false
    };

    if (import.meta.env.DEV) {
      console.log("[DIAGNOSTIC] Save dialog clicked. Initiating onSaveStudyNote call...");
    }
    onSaveStudyNote(newNote);
    setShowSaveSuccess(true);
    
    setTimeout(() => {
      setShowSaveSuccess(false);
      setActiveCreatorMessage(null);
    }, 1500);
  };

  return (
    <div id="chat-section-container" className="flex flex-col flex-1 h-full relative bg-slate-50/20 text-left">
      
      {/* Top status bar */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mx-3 mt-2 px-3 py-2.5 bg-gradient-to-br from-white via-sky-50 to-cyan-50 border border-sky-200/90 rounded-2xl text-[10px] text-slate-500 sticky top-0 z-10 shadow-[0_8px_20px_rgba(14,165,233,0.11)] font-sans relative overflow-hidden"
      >
        <div className="absolute -right-8 -top-8 w-20 h-20 rounded-full bg-sky-200/30 blur-xl pointer-events-none" />
        <div className="absolute -left-6 -bottom-8 w-16 h-16 rounded-full bg-cyan-200/25 blur-xl pointer-events-none" />
        <div className="relative flex items-center gap-1.5 font-bold">
          <span className={`w-2 h-2 rounded-full ${materials.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
          <span>
            {materials.length > 0 
              ? `${materials.length} active study source${materials.length > 1 ? 's' : ''}` 
              : "No study materials connected"}
          </span>
        </div>
        <motion.span
          whileHover={{ y: -1, scale: 1.03 }}
          transition={{ duration: 0.2 }}
          className="relative text-[9px] uppercase font-extrabold text-sky-700 tracking-wider flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/85 border border-sky-200 shadow-[0_4px_12px_rgba(14,165,233,0.14)]"
        >
          <Sparkles className="h-3 w-3" />
          <span>Study Workspace</span>
        </motion.span>
      </motion.div>

      {/* Messages View Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        
        {/* EMPTY STATE */}
        {messages.length === 0 && (
          <div id="chat-empty-state" className="max-w-md mx-auto py-8 text-center space-y-4">
            <motion.div
              initial={{ rotateX: -12, rotateY: 10, y: 4, scale: 0.94, opacity: 0 }}
              animate={{ rotateX: 0, rotateY: 0, y: 0, scale: 1, opacity: 1 }}
              whileHover={{ rotateX: -8, rotateY: 10, y: -3, scale: 1.06 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              style={{ transformPerspective: 700 }}
              className="inline-flex p-3 bg-gradient-to-br from-sky-100 via-white to-cyan-100 text-sky-600 rounded-2xl border border-sky-200 shadow-[0_8px_18px_rgba(14,165,233,0.16)]"
            >
              <BookOpen className="h-5.5 w-5.5 drop-shadow-[0_3px_3px_rgba(14,165,233,0.22)]" />
            </motion.div>

            <div className="space-y-1">
              <h1 className="text-base font-bold text-slate-800 tracking-tight">
                Study smarter with your notes.
              </h1>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-normal font-medium">
                Knowva answers study questions and drafts note cards based strictly on your syllabus, keeping your dialogue facts-anchored.
              </p>
            </div>

            {/* Suggestions list */}
            <div className="grid grid-cols-1 gap-2 text-left pt-2">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(sug)}
                  className="p-3 bg-gradient-to-r from-sky-50 via-white to-cyan-50 hover:from-sky-100 hover:to-cyan-50 border border-sky-100 hover:border-sky-300 rounded-xl text-left text-xs font-bold text-slate-700 transition-all cursor-pointer flex justify-between items-center group shadow-[0_4px_12px_rgba(14,165,233,0.08)]"
                >
                  <span className="truncate pr-2">{sug}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-sky-500 shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MESSAGES RENDER */}
        {messages.length > 0 && (
          <div className="max-w-xl mx-auto space-y-4 font-sans">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[90%] rounded-2xl p-4 text-xs shadow-sm ${
                  msg.sender === 'user' 
                    ? 'bg-sky-500 text-white border-none' 
                    : msg.sender === 'system'
                    ? 'bg-slate-50 text-slate-500 border border-slate-100'
                    : 'bg-white text-slate-800 border border-slate-100/70'
                }`}>
                  
                  {/* Sender header */}
                  <div className="flex items-center gap-1.5 mb-2 text-[9px] font-bold uppercase tracking-wider">
                    <span className={msg.sender === 'user' ? 'text-sky-100' : 'text-sky-600'}>
                      {msg.sender === 'user' ? 'YOU' : 'KNOWVA AI'}
                    </span>
                    <span className={msg.sender === 'user' ? 'text-sky-200' : 'text-slate-300'}>&bull;</span>
                    <span className={msg.sender === 'user' ? 'text-sky-100' : 'text-slate-400'}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Body Text */}
                  <p className="leading-relaxed whitespace-pre-wrap font-semibold">{msg.text}</p>
                  
                  {/* Sources display & Action labels */}
                  {msg.sender === 'assistant' && (
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2.5">
                      
                      {/* Document vs Extra Info Banner Indicator */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {materials.length > 0 ? (
                          <div className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-lg font-bold">
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span>Syllabus Verified</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-lg font-bold">
                            <Info className="h-3 w-3 text-amber-600" />
                            <span>Extra Info Supplemental</span>
                          </div>
                        )}

                        {/* Page citations */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                            <Bookmark className="h-3 w-3 text-sky-500" />
                            <span className="truncate max-w-[120px]">{msg.sources[0].title} (p. {msg.sources[0].page})</span>
                          </div>
                        )}
                      </div>

                      {/* Create Note Card */}
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleCreateStudyNoteDirect(msg)}
                          disabled={compilingNoteId !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-100/50 rounded-xl text-[10px] font-bold text-sky-600 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {compilingNoteId === msg.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin text-sky-500" />
                              <span>Compiling note...</span>
                            </>
                          ) : (
                            <>
                              <FileEdit className="h-3 w-3" />
                              <span>Create Study Note</span>
                            </>
                          )}
                        </button>
                      </div>

                    </div>
                  )}

                </div>
              </div>
            ))}

            {/* AI thinking state */}
            {isAiAnswering && (
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl p-4 text-xs bg-white border border-slate-100/70 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500 font-bold">
                    <Loader2 className="h-3.5 w-3.5 text-sky-500 animate-spin" />
                    <span>Knowva is researching your syllabus context...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

      </div>

      {/* Floating Notes Creator Wizard Drawer */}
      <AnimatePresence>
        {activeCreatorMessage && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="w-full max-w-md bg-white border-l border-slate-100 h-full flex flex-col shadow-2xl overflow-hidden text-left"
            >
              
              {/* Header */}
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <FileCheck2 className="h-4 w-4 text-sky-500" />
                    CREATE STUDY CARD
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-medium">Draft custom notes to persist in your Library.</p>
                </div>
                <button 
                  onClick={() => setActiveCreatorMessage(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body Form */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* Info status */}
                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] text-slate-600 flex gap-2 font-medium leading-relaxed">
                  <Info className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block text-slate-800 mb-0.5">Study Draft Sandbox</span>
                    You can draft and customize your study note card manually, or tap below to populate a completed cellular respiration study model for instant saving!
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePopulateModelDraft}
                  className="w-full py-2 bg-sky-50 hover:bg-sky-100/80 border border-dashed border-sky-200 rounded-xl text-[10px] font-bold text-sky-600 transition-all cursor-pointer"
                >
                  ⚡ Autofill Model Cell Respiration Study Note
                </button>

                {/* Form fields */}
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Note Title</label>
                    <input 
                      type="text"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Executive Summary</label>
                    <textarea 
                      value={noteSummary}
                      onChange={(e) => setNoteSummary(e.target.value)}
                      placeholder="High-level synthesis of this topic..."
                      className="w-full h-16 px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Key Concepts (Comma separated)</label>
                    <input 
                      type="text"
                      value={noteConcepts}
                      onChange={(e) => setNoteConcepts(e.target.value)}
                      placeholder="e.g., Glycolysis, Electron Transport Chain"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Important Definitions (Format Term: Definition)</label>
                    <textarea 
                      value={noteDefinitions}
                      onChange={(e) => setNoteDefinitions(e.target.value)}
                      placeholder="e.g., ATP: Energy currency of cell"
                      className="w-full h-14 px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Processes & Mechanisms</label>
                    <textarea 
                      value={noteMechanisms}
                      onChange={(e) => setNoteMechanisms(e.target.value)}
                      placeholder="Detailed process mechanics..."
                      className="w-full h-14 px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Exam-focused Points (New lines)</label>
                    <textarea 
                      value={noteExamPoints}
                      onChange={(e) => setNoteExamPoints(e.target.value)}
                      placeholder="Tested core facts..."
                      className="w-full h-14 px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Memory Cues & Mnemonics</label>
                    <input 
                      type="text"
                      value={noteMemoryCues}
                      onChange={(e) => setNoteMemoryCues(e.target.value)}
                      placeholder="Mnemonics or association guides..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Possible Oral Viva Questions</label>
                    <textarea 
                      value={noteVivaQuestions}
                      onChange={(e) => setNoteVivaQuestions(e.target.value)}
                      placeholder="What verbal follow-up questions might the examiner ask?"
                      className="w-full h-14 px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all resize-none"
                    />
                  </div>
                </div>

              </div>

              {/* Bottom save bar */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => setActiveCreatorMessage(null)}
                  className="flex-1 py-2 text-center text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors bg-white rounded-xl border border-slate-200 cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={handleSaveNoteToLibrary}
                  disabled={!noteTitle.trim()}
                  className={`flex-1 py-2 text-center text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    noteTitle.trim() 
                      ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sky-500/10' 
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed border-none'
                  }`}
                >
                  <Check className="h-4 w-4" />
                  <span>Save to Notes</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {showSaveSuccess && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5 z-50">
            <Check className="h-4 w-4" />
            <span>Saved to study card library!</span>
          </div>
        )}
      </AnimatePresence>

      {/* Input query form at bottom */}
      <div className="p-3.5 bg-white border-t border-slate-100 pb-5 sticky bottom-0 z-10">
        <form onSubmit={handleSubmit} className="max-w-xl mx-auto">
          <div className="relative flex items-center bg-slate-50 border border-slate-200 hover:border-sky-300 rounded-2xl transition-all focus-within:border-sky-500 focus-within:bg-white overflow-hidden pr-1.5 pl-3">
            <input 
              type="text"
              id="chat-text-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask questions about your study materials..."
              className="flex-1 py-3 text-xs text-slate-800 bg-transparent focus:outline-none min-w-0 placeholder-slate-400 font-semibold"
            />
            
            <motion.button
              type="submit"
              whileHover={{ y: -2, scale: 1.08, rotate: -3 }}
              whileTap={{ scale: 0.92, rotate: 2 }}
              transition={{ type: "spring", stiffness: 420, damping: 18 }}
              style={{ transformPerspective: 600 }}
              className="p-2 bg-gradient-to-br from-sky-500 via-blue-600 to-cyan-500 text-white rounded-xl flex items-center justify-center cursor-pointer shrink-0 shadow-[0_6px_14px_rgba(14,165,233,0.28)] border border-sky-400/60"
              title="Submit question"
            >
              <Send className="h-3 w-3 drop-shadow-[0_2px_2px_rgba(0,0,0,0.18)]" />
            </motion.button>
          </div>
          
          <p className="text-[9px] text-center text-slate-400 mt-2 font-semibold">
            {materials.length > 0 
              ? `Knowva answers are anchored to context from: "${materials[materials.length - 1].name}".`
              : "Upload PDF or paste notes above to target answers directly to your syllabus."}
          </p>
        </form>
      </div>

    </div>
  );
}
