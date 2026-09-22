/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
import { StudyMaterial, StudyNote } from '../types';

interface PlaceholderSectionProps {
  type: 'viva' | 'progress' | 'notes';
  uploadedMaterials: StudyMaterial[];
  savedStudyNotes: StudyNote[];
  onRemoveStudyNote: (id: string) => void;
  onToggleFavoriteNote?: (id: string) => void;
  onNavigateToAsk: () => void;
  messagesCount: number;
}

export default function PlaceholderSection({ 
  type, 
  uploadedMaterials, 
  savedStudyNotes,
  onRemoveStudyNote,
  onToggleFavoriteNote,
  onNavigateToAsk,
  messagesCount
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

  // VIVA PRACTICE SECTION RENDER
  if (type === 'viva') {
    return (
      <motion.div 
        id="viva-section-container" 
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="max-w-xl mx-auto px-4 py-4 sm:py-8 space-y-6 pb-24 text-left font-sans"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <motion.div 
            animate={{ scale: [1, 1.04, 1], rotate: [0, 0.5, -0.5, 0] }}
            transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
            className="inline-flex items-center justify-center p-3 bg-sky-50 text-sky-600 rounded-2xl border border-sky-100 shadow-sm mb-1"
          >
            <Mic className="h-6 w-6" />
          </motion.div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">Adaptive Oral Viva Drill</h1>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
            Practice spoken recall by responding to randomized verbal questioning based strictly on your source notes.
          </p>
        </div>

        {/* Feature specifications block */}
        <div className="grid grid-cols-1 gap-3">
          <motion.div 
            variants={cardHover}
            whileHover="hover"
            className="p-4 bg-white border border-slate-100 rounded-2xl space-y-2 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]" />
              <h3 className="font-extrabold text-[10px] text-slate-800 uppercase tracking-widest">
                Targeted Oral Prompting
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
              Knowva targets the specific assertions in your syllabus, generating verbal questions that challenge your technical terminology accuracy.
            </p>
          </motion.div>

          <motion.div 
            variants={cardHover}
            whileHover="hover"
            className="p-4 bg-white border border-slate-100 rounded-2xl space-y-2 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
              <h3 className="font-extrabold text-[10px] text-slate-800 uppercase tracking-widest">
                Weakness Decay Drill
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
              If your review records show hesitations on any specific terms, the simulator initiates focused follow-up cycles on those knowledge gaps.
            </p>
          </motion.div>

          <motion.div 
            variants={cardHover}
            whileHover="hover"
            className="p-4 bg-white border border-slate-100 rounded-2xl space-y-2 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
              <h3 className="font-extrabold text-[10px] text-slate-800 uppercase tracking-widest">
                Skeptical Examination Mode
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
              To evaluate critical thinking, the simulated assistant occasionally asserts a deliberate, subtle error. Your task is to identify and correct it.
            </p>
          </motion.div>
        </div>

        {/* Action Panel */}
        <div className="p-5 bg-white border border-slate-100 rounded-2xl text-center space-y-4 shadow-sm">
          <div className="p-2 bg-sky-50 border border-sky-100 rounded-xl inline-block text-[10px] text-sky-700 font-extrabold tracking-wider uppercase">
            Awaiting Speech Integration
          </div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
            Once you connect your voice recording, spoken answers will be evaluated for keyword mapping and precision score in real-time.
          </p>
          <div className="pt-1">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onNavigateToAsk}
              className="px-5 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-md shadow-sky-500/10 border-none"
            >
              <span>Go to Ask Workspace</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  // PROGRESS TRACKER SECTION RENDER
  if (type === 'progress') {
    const studyStreak = uploadedMaterials.length > 0 || messagesCount > 0 ? 1 : 0;

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
          <div className="inline-flex items-center justify-center p-3 bg-sky-50 text-sky-600 rounded-2xl border border-sky-100 shadow-sm mb-1">
            <TrendingUp className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">Factual Progress Analytics</h1>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
            Monitor study streaks, active definitions coverage, and estimated recall metrics.
          </p>
        </div>

        {/* Factual Study Stats */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div whileHover={{ y: -2 }} className="p-4 bg-white border border-slate-100 rounded-2xl text-center shadow-sm">
            <span className="text-[9px] text-slate-400 block uppercase font-extrabold mb-1 tracking-wider">Study Streak</span>
            <span className="text-base font-bold text-slate-800">{studyStreak} Day</span>
          </motion.div>

          <motion.div whileHover={{ y: -2 }} className="p-4 bg-white border border-slate-100 rounded-2xl text-center shadow-sm">
            <span className="text-[9px] text-slate-400 block uppercase font-extrabold mb-1 tracking-wider">Asked Queries</span>
            <span className="text-base font-bold text-slate-800">{messagesCount}</span>
          </motion.div>

          <motion.div whileHover={{ y: -2 }} className="p-4 bg-white border border-slate-100 rounded-2xl text-center shadow-sm">
            <span className="text-[9px] text-slate-400 block uppercase font-extrabold mb-1 tracking-wider">Saved Cards</span>
            <span className="text-base font-bold text-slate-800">{savedStudyNotes.length}</span>
          </motion.div>

          <motion.div whileHover={{ y: -2 }} className="p-4 bg-white border border-slate-100 rounded-2xl text-center shadow-sm">
            <span className="text-[9px] text-slate-400 block uppercase font-extrabold mb-1 tracking-wider">Active Uploads</span>
            <span className="text-base font-bold text-slate-800">{uploadedMaterials.length}</span>
          </motion.div>
        </div>

        {/* Memory Strength Metrics */}
        <div className="p-5 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
          <h3 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
            <Target className="h-4 w-4 text-sky-500" />
            <span>Active Memory Strength Metrics</span>
          </h3>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold mb-1">
                <span>ESTIMATED RETENTION DEPTH</span>
                <span className="text-sky-600 font-bold">85%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: "85%" }} 
                  transition={{ duration: 1, ease: "easeOut" }} 
                  className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full" 
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold mb-1">
                <span>VIVA COMPREHENSION RATING</span>
                <span className="text-blue-600 font-bold">72%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: "72%" }} 
                  transition={{ duration: 1.2, ease: "easeOut" }} 
                  className="h-full bg-gradient-to-r from-blue-500 to-sky-400 rounded-full" 
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold mb-1">
                <span>RECALL ACCURACY RATE</span>
                <span className="text-emerald-600 font-bold">90%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: "90%" }} 
                  transition={{ duration: 0.8, ease: "easeOut" }} 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recall Stability Curves */}
        <div className="p-5 bg-white border border-slate-100 rounded-2xl text-left space-y-3 shadow-sm">
          <h3 className="text-[10px] font-extrabold text-sky-600 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            <span>Memory Retention Estimations</span>
          </h3>

          <p className="text-xs text-slate-500 leading-relaxed font-semibold">
            Knowva analyzes query complexity and study material depth to project retention decline intervals over time.
          </p>

          <div className="p-3 bg-sky-50/50 border border-sky-100 rounded-2xl text-[10px] text-slate-600 space-y-1 font-semibold leading-relaxed">
            <span className="font-extrabold text-sky-700 block mb-0.5">Awaiting Additional Study Checkpoints</span>
            Please upload syllabus files and compile study cards. Our analytical engine requires active data history points to model subject weaknesses accurately.
          </div>
        </div>

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
