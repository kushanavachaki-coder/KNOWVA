/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateStudyStreak } from '../utils/streakCalc';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Mic, 
  TrendingUp, 
  BookOpen, 
  FileCheck2,
  ArrowRight,
  X,
  Search,
  Star,
  Target,
  Eye,
  Trash2,
  Sparkles,
  Info
} from 'lucide-react';
import { StudyMaterial, StudyNote, Message } from '../types';
import VivaSection from './VivaSection';

interface PlaceholderSectionProps {
  type: 'viva' | 'progress' | 'notes';
  uploadedMaterials: StudyMaterial[];
  savedStudyNotes: StudyNote[];
  onRemoveStudyNote: (id: string) => void;
  onToggleFavoriteNote?: (id: string) => void;
  onNavigateToAsk: () => void;
  messagesCount: number;
  messages?: Message[];
  userId?: string;
}

export default function PlaceholderSection({ 
  type, 
  uploadedMaterials, 
  savedStudyNotes,
  onRemoveStudyNote,
  onToggleFavoriteNote,
  onNavigateToAsk,
  messagesCount,
  messages = [],
  userId = 'user_default'
}: PlaceholderSectionProps) {
  const [selectedNote, setSelectedNote] = useState<StudyNote | null>(null);
  
  // Search & Filter State for Notes section
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  // Animation configuration
  const pageVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
    exit: { opacity: 0, y: -12, transition: { duration: 0.2 } }
  };

  const cardHover = {
    hover: { y: -3, boxShadow: "0 10px 25px -5px rgba(14,165,233,0.04)", borderColor: "#bae6fd" }
  };

  // Real data-driven Progress metric calculation
  const progressMetrics = React.useMemo(() => {
    if (type !== 'progress') return null;

    const allMsgs = messages || [];

    // Helper: format Date into local YYYY-MM-DD string
    const toLocalDateStr = (d: Date | string | number) => {
      const dateObj = new Date(d);
      if (isNaN(dateObj.getTime())) return '';
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // 1. Calculate unique active calendar dates
    const activeDatesSet = new Set<string>();

    allMsgs.forEach(m => {
      const dStr = toLocalDateStr(m.timestamp);
      if (dStr) activeDatesSet.add(dStr);
    });

    savedStudyNotes.forEach(n => {
      const dStr = toLocalDateStr(n.createdAt);
      if (dStr) activeDatesSet.add(dStr);
    });

    uploadedMaterials.forEach(mat => {
      const dStr = toLocalDateStr(mat.uploadedAt);
      if (dStr) activeDatesSet.add(dStr);
    });

    // 2. Calculate consecutive streak using shared calculation utility
    const studyStreak = calculateStudyStreak(allMsgs, savedStudyNotes, uploadedMaterials);

    const activeDaysCount = activeDatesSet.size;

    // 3. Grounded Answer Rate (Syllabus Coverage)
    // Filter model messages (sender === 'assistant' or sender === 'model')
    const modelAnswers = allMsgs.filter(m => (m.sender as string) === 'assistant' || (m.sender as string) === 'model');
    const totalAnswers = modelAnswers.length;
    const groundedAnswers = modelAnswers.filter(m => !m.isExtraInfo).length;
    const groundedRate = totalAnswers > 0 ? Math.round((groundedAnswers / totalAnswers) * 100) : null;

    // 4. Learning Assets Collected across Saved Study Cards
    const totalConcepts = savedStudyNotes.reduce((acc, note) => acc + (note.keyConcepts?.length || 0), 0);
    const totalDefinitions = savedStudyNotes.reduce((acc, note) => acc + (note.definitions?.length || 0), 0);
    const totalVivaQuestions = savedStudyNotes.reduce((acc, note) => acc + (note.vivaQuestions?.length || 0), 0);

    // 5. Material Breakdown
    const materialMap = new Map<string, {
      title: string;
      groundedQueries: number;
      studyCards: number;
      concepts: number;
    }>();

    // Populate with uploaded materials
    uploadedMaterials.forEach(mat => {
      materialMap.set(mat.name, {
        title: mat.name,
        groundedQueries: 0,
        studyCards: 0,
        concepts: 0
      });
    });

    // Match saved notes to materials
    savedStudyNotes.forEach(note => {
      const src = note.sourceTitle || 'General Knowledge';
      let foundKey = Array.from(materialMap.keys()).find(
        k => k.toLowerCase() === src.toLowerCase() || k.toLowerCase().includes(src.toLowerCase()) || src.toLowerCase().includes(k.toLowerCase())
      );
      if (!foundKey && src !== 'General Knowledge') {
        foundKey = src;
        materialMap.set(src, {
          title: src,
          groundedQueries: 0,
          studyCards: 0,
          concepts: 0
        });
      }
      if (foundKey) {
        const entry = materialMap.get(foundKey)!;
        entry.studyCards += 1;
        entry.concepts += (note.keyConcepts?.length || 0);
      }
    });

    // Match grounded queries to materials
    allMsgs.forEach(m => {
      if (m.sources && m.sources.length > 0) {
        m.sources.forEach(s => {
          if (!s.title) return;
          const foundKey = Array.from(materialMap.keys()).find(
            k => k.toLowerCase() === s.title.toLowerCase() || k.toLowerCase().includes(s.title.toLowerCase()) || s.title.toLowerCase().includes(k.toLowerCase())
          );
          if (foundKey) {
            const entry = materialMap.get(foundKey)!;
            entry.groundedQueries += 1;
          }
        });
      }
    });

    const materialBreakdown = Array.from(materialMap.values());
    const hasAnyData = uploadedMaterials.length > 0 || savedStudyNotes.length > 0 || messagesCount > 0;

    return {
      studyStreak,
      activeDaysCount,
      groundedRate,
      groundedAnswers,
      totalAnswers,
      totalConcepts,
      totalDefinitions,
      totalVivaQuestions,
      materialBreakdown,
      hasAnyData
    };
  }, [type, messages, savedStudyNotes, uploadedMaterials, messagesCount]);

  // VIVA PRACTICE SECTION RENDER
  if (type === 'viva') {
    return (
      <VivaSection 
        userId={userId}
        uploadedMaterials={uploadedMaterials}
        onNavigateToAsk={onNavigateToAsk}
      />
    );
  }

  // PROGRESS TRACKER SECTION RENDER
  if (type === 'progress') {
    const metrics = progressMetrics || {
      studyStreak: 0,
      activeDaysCount: 0,
      groundedRate: null,
      groundedAnswers: 0,
      totalAnswers: 0,
      totalConcepts: 0,
      totalDefinitions: 0,
      totalVivaQuestions: 0,
      materialBreakdown: [],
      hasAnyData: false
    };

    return (
      <motion.div 
        id="progress-section-container" 
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="max-w-xl mx-auto px-4 py-4 sm:py-8 space-y-6 pb-24 text-left font-sans"
      >
        
        {/* Header */}
        <div className="text-center space-y-2">
          <motion.div
            initial={{ rotateX: -12, rotateY: 10, y: 4, scale: 0.94, opacity: 0 }}
            animate={{ rotateX: 0, rotateY: 0, y: 0, scale: 1, opacity: 1 }}
            whileHover={{ rotateX: -8, rotateY: 10, y: -3, scale: 1.06 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            style={{ transformPerspective: 700 }}
            className="inline-flex p-3 bg-gradient-to-br from-sky-100 via-white to-cyan-100 text-sky-600 rounded-2xl border border-sky-200 shadow-[0_8px_18px_rgba(14,165,233,0.16)] mb-1 relative overflow-hidden"
          >
            <div className="absolute -right-3 -top-3 w-8 h-8 rounded-full bg-cyan-200/35 blur-md pointer-events-none" />
            <TrendingUp className="h-5.5 w-5.5 relative drop-shadow-[0_3px_3px_rgba(14,165,233,0.22)]" />
          </motion.div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">Factual Progress Analytics</h1>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
            Track real active study streaks, syllabus grounding coverage, and collected study card assets.
          </p>
        </div>

        {/* Factual Study Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: "Study Streak",
              value: `${metrics.studyStreak} ${metrics.studyStreak === 1 ? 'Day' : 'Days'}`,
              detail: `${metrics.activeDaysCount} Active ${metrics.activeDaysCount === 1 ? 'Day' : 'Days'} Total`
            },
            {
              label: "Asked Queries",
              value: String(messagesCount),
              detail: "Submitted Q&A"
            },
            {
              label: "Saved Cards",
              value: String(savedStudyNotes.length),
              detail: "Compiled Flashcards"
            },
            {
              label: "Active Uploads",
              value: String(uploadedMaterials.length),
              detail: "Syllabus Sources"
            }
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.25 }}
              whileHover={{ y: -3, scale: 1.01 }}
              className="p-4 bg-gradient-to-r from-sky-50 via-white to-cyan-50 hover:from-sky-100 hover:to-cyan-50 border border-sky-100 hover:border-sky-300 rounded-xl text-center shadow-[0_4px_12px_rgba(14,165,233,0.08)] transition-colors"
            >
              <span className="text-[9px] text-sky-700 block uppercase font-extrabold mb-1 tracking-wider">{stat.label}</span>
              <span className="text-base font-bold text-slate-800">{stat.value}</span>
              <span className="text-[9px] text-slate-500 block font-semibold mt-0.5">{stat.detail}</span>
            </motion.div>
          ))}
        </div>

        {!metrics.hasAnyData ? (
          /* Empty State for Brand New Users */
          <div className="p-6 bg-white border border-slate-100 rounded-2xl text-center space-y-3 shadow-sm">
            <div className="inline-flex items-center justify-center p-3 bg-sky-50 text-sky-600 rounded-xl mb-1">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Study Activity Recorded Yet</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto font-semibold leading-relaxed">
              Upload syllabus materials, ask questions in workspace, or compile study notes to build your factual learning progress.
            </p>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onNavigateToAsk}
              className="mt-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-md shadow-sky-500/10 border-none"
            >
              <span>Start Studying</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </motion.button>
          </div>
        ) : (
          <>
            {/* Grounding & Asset Coverage Metrics */}
            <div className="p-5 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
              <h3 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <Target className="h-4 w-4 text-sky-500" />
                <span>Syllabus Grounding & Asset Metrics</span>
              </h3>

              <div className="space-y-4">
                {/* Grounded Answer Rate */}
                <div>
                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold mb-1">
                    <span>STUDY MATERIAL GROUNDING RATE</span>
                    <span className="text-sky-600 font-bold">
                      {metrics.groundedRate !== null ? `${metrics.groundedRate}%` : "Not enough data"}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: metrics.groundedRate !== null ? `${metrics.groundedRate}%` : "0%" }} 
                      transition={{ duration: 0.8, ease: "easeOut" }} 
                      className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full" 
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 font-semibold mt-1 block">
                    {metrics.groundedAnswers} of {metrics.totalAnswers} AI answers grounded in uploaded syllabus sources
                  </span>
                </div>

                {/* Real Asset Counts Grid */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                  <div className="p-2.5 bg-slate-50/70 rounded-xl text-center">
                    <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Concepts Collected</span>
                    <span className="text-sm font-extrabold text-slate-800">{metrics.totalConcepts}</span>
                  </div>

                  <div className="p-2.5 bg-slate-50/70 rounded-xl text-center">
                    <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Definitions Built</span>
                    <span className="text-sm font-extrabold text-slate-800">{metrics.totalDefinitions}</span>
                  </div>

                  <div className="p-2.5 bg-slate-50/70 rounded-xl text-center">
                    <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Viva Drill Questions</span>
                    <span className="text-sm font-extrabold text-slate-800">{metrics.totalVivaQuestions}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Syllabus Material Breakdown */}
            <div className="p-5 bg-white border border-slate-100 rounded-2xl text-left space-y-3 shadow-sm">
              <h3 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-sky-500" />
                <span>Syllabus Material Breakdown</span>
              </h3>

              {metrics.materialBreakdown.length > 0 ? (
                <div className="space-y-2.5 pt-1">
                  {metrics.materialBreakdown.map((mat, idx) => (
                    <div key={idx} className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-slate-800 truncate block">{mat.title}</span>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 font-semibold">
                          <span>{mat.groundedQueries} Grounded Queries</span>
                          <span>•</span>
                          <span>{mat.studyCards} Saved Cards</span>
                          <span>•</span>
                          <span>{mat.concepts} Concepts</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                  No syllabus materials uploaded yet. Upload a PDF or paste text in the Study Materials tab to view material-level breakdown.
                </p>
              )}
            </div>

            {/* Viva & Recall Accuracy Note */}
            <div className="p-4 bg-sky-50/50 border border-sky-100 rounded-2xl text-left space-y-1.5 shadow-sm">
              <div className="flex items-center gap-1.5 text-sky-700 font-bold text-[11px]">
                <Info className="h-4 w-4 text-sky-500 shrink-0" />
                <span>Recall & Viva Performance Ratings</span>
              </div>
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                Spoken recall accuracy and oral viva comprehension metrics will unlock when spoken drill test sessions are completed. Knowva displays only verified factual progress.
              </p>
            </div>
          </>
        )}

      </motion.div>
    );
  }

  // NOTES INDEX LIBRARY SECTION RENDER
  if (type === 'notes') {
    // Filter study notes based on search query and favorite toggles
    const filteredNotes = savedStudyNotes.filter(note => {
      const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            note.summary.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFavorite = !showOnlyFavorites || note.isFavorite;
      return matchesSearch && matchesFavorite;
    });

    const filteredMaterials = uploadedMaterials.filter(mat => 
      mat.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <motion.div 
        id="notes-section-container" 
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="max-w-3xl mx-auto px-4 py-4 sm:py-6 space-y-6 pb-24 text-left font-sans"
      >
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-sky-50 text-sky-600 rounded-2xl border border-sky-100 shadow-sm mb-1">
            <FileText className="h-6 w-6 text-sky-600" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">Active Study Library</h1>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
            Catalog and view uploaded syllabus materials alongside customized study notes compiled during your interactive chats.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="bg-white border border-slate-150 shadow-sm rounded-2xl p-3 flex flex-col gap-2.5">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search library notes and materials..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-semibold"
            />
          </div>

          <div className="flex items-center justify-end">
            <button
              onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                showOnlyFavorites 
                  ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm shadow-amber-500/10' 
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              <Star className={`h-3 w-3 ${showOnlyFavorites ? 'fill-amber-500 text-amber-500' : 'text-slate-400'}`} />
              <span>{showOnlyFavorites ? 'Starred Cards' : 'Filter Starred'}</span>
            </button>
          </div>
        </div>

        {/* Multi-Column List layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          
          {/* Group 1: Source Materials */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 pl-1">
              <span className="w-1.5 h-1.5 bg-sky-500 rounded-full"></span>
              Syllabus Materials ({filteredMaterials.length})
            </h3>

            {filteredMaterials.length === 0 ? (
              <div className="p-6 bg-white border border-dashed border-slate-200 rounded-2xl text-center space-y-2 shadow-sm">
                <BookOpen className="h-6 w-6 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-700 font-bold">No documents indexed</p>
                <p className="text-[10px] text-slate-400 leading-normal">Materials uploaded in your active chat session catalog here automatically.</p>
                <button 
                  onClick={onNavigateToAsk}
                  className="mt-1 text-[11px] font-bold text-sky-600 hover:underline cursor-pointer border-none bg-transparent"
                >
                  Upload Materials &rarr;
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMaterials.map((mat) => (
                  <motion.div 
                    whileHover={{ y: -1 }}
                    key={mat.id} 
                    className="p-3 bg-white border border-slate-100 rounded-2xl flex items-center justify-between shadow-sm"
                  >
                    <div className="min-w-0 pr-2">
                      <h4 className="text-xs font-bold text-slate-800 truncate">{mat.name}</h4>
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase mt-0.5">
                        {mat.type} &bull; {mat.fileSize || 'Pasted Notes'}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 bg-sky-50 text-[9px] text-sky-600 border border-sky-100 rounded-md font-bold uppercase tracking-wider">
                      ACTIVE
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Group 2: Saved Study Notes */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 pl-1">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
              Compiled Study Cards ({filteredNotes.length})
            </h3>

            {filteredNotes.length === 0 ? (
              <div className="p-6 bg-white border border-dashed border-slate-200 rounded-2xl text-center space-y-2 shadow-sm">
                <FileCheck2 className="h-6 w-6 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-700 font-bold">No study cards compiled</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Ask study questions in the <strong>Ask</strong> workspace and click <strong>"Create Study Note"</strong> under responses to compile custom cards!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredNotes.map((note) => (
                  <motion.div 
                    whileHover={{ y: -1 }}
                    key={note.id} 
                    className="p-3 bg-white border border-slate-100 rounded-2xl flex items-center justify-between group shadow-sm"
                  >
                    <div className="min-w-0 pr-2 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{note.title}</h4>
                        {note.isFavorite && (
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5 truncate font-semibold">
                        Derived: {note.sourceTitle}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Favorite button */}
                      <button
                        onClick={() => onToggleFavoriteNote && onToggleFavoriteNote(note.id)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          note.isFavorite 
                            ? 'text-amber-500 hover:bg-amber-50' 
                            : 'text-slate-300 hover:text-amber-500 hover:bg-slate-50'
                        }`}
                        title={note.isFavorite ? 'Remove Star' : 'Star Card'}
                      >
                        <Star className={`h-3.5 w-3.5 ${note.isFavorite ? 'fill-amber-500' : ''}`} />
                      </button>

                      {/* View card */}
                      <button
                        onClick={() => setSelectedNote(note)}
                        className="p-1.5 text-sky-500 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                        title="View Note Card"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      
                      {/* Delete */}
                      <button
                        onClick={() => onRemoveStudyNote(note.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                        title="Delete Note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Detailed Study Note Review Modal */}
        <AnimatePresence>
          {selectedNote && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
              <motion.div 
                initial={{ opacity: 0, scale: 0.97, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 15 }}
                className="bg-white border border-slate-100 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
              >
                
                {/* Modal Header */}
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-left">
                  <div className="min-w-0 pr-4">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-sky-600">STUDY NOTE COMPILATION</span>
                    <h2 className="text-sm font-bold text-slate-800 mt-0.5 truncate">{selectedNote.title}</h2>
                  </div>
                  <button 
                    onClick={() => setSelectedNote(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg shrink-0 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-700 text-left">
                  
                  {/* Summary */}
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase tracking-wider text-sky-600 font-extrabold">Summary</span>
                    <p className="bg-slate-50 p-3 rounded-2xl border border-slate-100 leading-relaxed font-semibold text-slate-700">
                      {selectedNote.summary}
                    </p>
                  </div>

                  {/* Concepts */}
                  {selectedNote.keyConcepts.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider text-sky-600 font-extrabold">Key Concepts</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedNote.keyConcepts.map((c, i) => (
                          <span key={i} className="px-2.5 py-0.5 bg-sky-50 border border-sky-100/50 rounded-full text-[10px] text-sky-700 font-bold">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Definitions */}
                  {selectedNote.definitions.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider text-sky-600 font-extrabold">Important Definitions</span>
                      <div className="space-y-1.5">
                        {selectedNote.definitions.map((d, i) => (
                          <div key={i} className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                            <strong className="text-slate-800 block mb-0.5">{d.term}</strong>
                            <p className="text-slate-500 leading-relaxed font-semibold">{d.definition}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mechanisms */}
                  {selectedNote.mechanisms.length > 0 && selectedNote.mechanisms[0] && (
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider text-sky-600 font-extrabold">Processes & Mechanisms</span>
                      <p className="bg-slate-50 p-3 rounded-2xl border border-slate-100 leading-relaxed font-semibold text-slate-700">
                        {selectedNote.mechanisms[0]}
                      </p>
                    </div>
                  )}

                  {/* Exam Points */}
                  {selectedNote.examPoints.length > 0 && selectedNote.examPoints[0] && (
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider text-sky-600 font-extrabold">Exam-focused points</span>
                      <ul className="space-y-1 list-disc pl-4 text-slate-500 font-semibold">
                        {selectedNote.examPoints.map((pt, i) => (
                          <li key={i} className="leading-relaxed">{pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Memory Cues */}
                  {selectedNote.memoryCues.length > 0 && selectedNote.memoryCues[0] && (
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider text-sky-600 font-extrabold">Memory Cues & Mnemonics</span>
                      <p className="bg-amber-50/50 p-3 rounded-2xl border border-amber-100 leading-relaxed text-slate-700 italic font-semibold">
                        "{selectedNote.memoryCues[0]}"
                      </p>
                    </div>
                  )}

                  {/* Viva Questions */}
                  {selectedNote.vivaQuestions.length > 0 && selectedNote.vivaQuestions[0] && (
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider text-sky-600 font-extrabold">Viva Practice Drill Point</span>
                      <p className="bg-sky-50/70 p-3 rounded-2xl border border-sky-100 text-sky-700 font-semibold">
                        Q: {selectedNote.vivaQuestions[0]}
                      </p>
                    </div>
                  )}

                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-bold">
                    Compiled {new Date(selectedNote.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => setSelectedNote(null)}
                    className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-md shadow-sky-500/10 border-none"
                  >
                    Close Review
                  </button>
                </div>

              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </motion.div>
    );
  }

  return null;
}
