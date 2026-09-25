/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateStudyStreak } from '../utils/streakCalc';
import React from 'react';
import { motion } from 'motion/react';
import { 
  Sparkles, 
  MessageSquare, 
  Upload, 
  FileEdit, 
  Mic, 
  Flame,
  ChevronRight,
  BookOpen,
  TrendingUp,
  Target,
  ArrowRight,
  Award,
  BookMarked,
  CheckCircle,
  HelpCircle,
  Clock,
  Brain
} from 'lucide-react';
import { TabType, StudyMaterial, StudyNote } from '../types';

interface HomeSectionProps {
  userName: string;
  materials: StudyMaterial[];
  savedStudyNotes: StudyNote[];
  messages: any[];
  onNavigate: (tab: TabType) => void;
  onOpenQuickUpload: () => void;
  onOpenQuickNote: () => void;
}

export default function HomeSection({
  userName,
  materials,
  savedStudyNotes,
  messages,
  onNavigate,
  onOpenQuickUpload,
  onOpenQuickNote
}: HomeSectionProps) {
  
  // Calculate genuine stats
  const questionsAskedCount = messages.filter(m => m.sender === 'user').length;
  const notesCreatedCount = savedStudyNotes.length;
  const materialsUploadedCount = materials.length;
  const studyStreak = calculateStudyStreak(messages, savedStudyNotes, materials); 

  const latestMaterial = materials.length > 0 ? materials[materials.length - 1] : null;

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Stagger animation setups
  const listVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 25 } }
  };

  return (
    <motion.div 
      id="home-dashboard" 
      variants={listVariants}
      initial="hidden"
      animate="show"
      className="w-full max-w-md mx-auto space-y-5 pb-24 text-left"
    >
      {/* 1. BRANDING & GREETING ROW */}
      <motion.div variants={itemVariants} className="flex items-center justify-between bg-gradient-to-r from-sky-50 to-blue-50/30 p-4 rounded-2xl border border-sky-100/50">
        <div className="space-y-1">
          <span className="text-[9px] font-extrabold tracking-widest text-sky-600 uppercase block">
            STUDY HUB
          </span>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">
            {getGreeting()}, <span className="text-blue-600">{userName || 'Scholar'}</span>
          </h1>
          <p className="text-[11px] text-slate-500 font-medium">
            Ready to achieve your study goals today?
          </p>
        </div>
        
        {/* Study Streak Badge in Header */}
        <motion.div 
          whileHover={{ scale: 1.05 }}
          className="bg-amber-500 text-white rounded-xl px-3 py-1.5 flex items-center gap-1 shadow-md shadow-amber-500/10"
        >
          <Flame className="h-4 w-4 fill-amber-100" />
          <span className="text-xs font-bold">{studyStreak} Days</span>
        </motion.div>
      </motion.div>

      {/* 2. REAL ACTIVITY SUMMARY (NO FAKE RETENTION/XP/LEVEL) */}
      <motion.div 
        variants={itemVariants}
        className="bg-gradient-to-br from-slate-900 to-blue-950 text-white p-5 rounded-2xl relative overflow-hidden shadow-xl"
      >
        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-28 h-28 bg-sky-500/10 rounded-full blur-2xl" />
        <div className="absolute left-1/3 top-0 -translate-y-6 w-16 h-16 bg-cyan-400/10 rounded-full blur-xl" />
        
        <div className="space-y-4 relative">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold tracking-widest text-cyan-300 uppercase block">
              Study Activity Overview
            </span>
            <span className="text-[10px] font-semibold bg-sky-500/20 text-cyan-200 border border-sky-500/30 px-2 py-0.5 rounded-full">
              {materialsUploadedCount > 0 ? `${materialsUploadedCount} Materials Indexed` : 'No Materials'}
            </span>
          </div>

          {materialsUploadedCount === 0 && questionsAskedCount === 0 && notesCreatedCount === 0 ? (
            <div className="py-2 space-y-1">
              <p className="text-xs text-slate-300 font-medium">
                No learning activity recorded yet. Upload study materials or ask questions to populate your analytics.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="bg-white/10 p-2.5 rounded-xl text-center">
                <span className="text-lg font-black text-white block">{materialsUploadedCount}</span>
                <span className="text-[9px] text-cyan-200 font-bold uppercase tracking-wider block">Materials</span>
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl text-center">
                <span className="text-lg font-black text-white block">{questionsAskedCount}</span>
                <span className="text-[9px] text-cyan-200 font-bold uppercase tracking-wider block">Queries</span>
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl text-center">
                <span className="text-lg font-black text-white block">{notesCreatedCount}</span>
                <span className="text-[9px] text-cyan-200 font-bold uppercase tracking-wider block">Study Notes</span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* 3. SMART REVISION ENTRY CARD (REPLACING FAKE TOPIC) */}
      <motion.div variants={itemVariants} className="space-y-2">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
            Active Recall & Revision
          </h3>
          <button 
            onClick={() => onNavigate('revision')}
            className="text-[10px] font-bold text-sky-600 flex items-center gap-0.5 hover:underline"
          >
            Smart Revision <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        
        <div className="bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-2xl p-4 flex items-center justify-between shadow-md shadow-sky-500/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0">
              <Brain className="h-5 w-5" />
            </div>
            <div className="space-y-0.5 text-left">
              <h4 className="text-xs font-bold">Smart Revision</h4>
              <p className="text-[10px] text-sky-100 font-medium">
                Targeted active recall based on your actual study material and history.
              </p>
            </div>
          </div>
          <button 
            onClick={() => onNavigate('revision')}
            className="px-3 py-2 bg-white text-blue-600 hover:bg-slate-50 text-xs font-bold rounded-xl shadow-sm transition-all shrink-0 cursor-pointer flex items-center gap-1"
          >
            <span>Start</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </motion.div>

      {/* 4. CONTINUE STUDYING SECTION */}
      <motion.div variants={itemVariants} className="space-y-2">
        <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-1">
          Continue Studying
        </h3>

        <motion.div
          whileHover={{ y: -2, scale: 1.005 }}
          className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-blue-600 to-cyan-500 border border-sky-300/60 p-4.5 rounded-2xl space-y-4 shadow-[0_0_28px_rgba(14,165,233,0.28)]"
        >
          <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-cyan-300/25 blur-2xl animate-pulse" />
          <div className="absolute -left-10 -bottom-10 w-28 h-28 rounded-full bg-blue-300/20 blur-3xl" />
          <div className="relative space-y-1 text-left">
            <span className="text-[9px] font-extrabold tracking-widest text-cyan-100 uppercase block">
              Active Source Document
            </span>
            <h3 className="text-sm font-bold truncate text-white">
              {latestMaterial ? latestMaterial.name : "Cellular & Molecular Biology Basics"}
            </h3>
            <p className="text-[10px] text-sky-50/90 font-medium">
              {latestMaterial 
                ? `Indexed on ${new Date(latestMaterial.uploadedAt).toLocaleDateString()} • ${latestMaterial.fileSize || 'Pasted text'}` 
                : "No study notes connected yet."}
            </p>
          </div>

          <div className="relative flex items-center justify-between pt-1">
            <span className="text-[10px] bg-white/15 text-white px-2.5 py-1 rounded-lg border border-white/20 font-semibold backdrop-blur-sm">
              {latestMaterial ? "Ready for practicing" : "Requires active doc"}
            </span>
            <motion.button
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate('ask')}
              className="px-3.5 py-1.5 bg-white text-blue-600 hover:bg-cyan-50 text-xs font-bold rounded-lg shadow-[0_0_16px_rgba(255,255,255,0.28)] flex items-center gap-1 cursor-pointer"
            >
              <span>Resume</span>
              <ArrowRight className="h-3 w-3" />
            </motion.button>
          </div>
        </motion.div>
      </motion.div>

      {/* 5. QUICK ACTIONS */}
      <motion.div variants={itemVariants} className="space-y-2">
        <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-1">
          Quick Actions
        </h3>
        
        <div className="grid grid-cols-2 gap-2.5">
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onNavigate('ask')}
            className="p-3.5 bg-gradient-to-br from-sky-500 to-blue-600 border border-sky-300/60 hover:from-sky-400 hover:to-blue-500 rounded-2xl text-left transition-all cursor-pointer flex flex-col justify-between items-start gap-4 shadow-[0_0_22px_rgba(14,165,233,0.22)] text-white"
          >
            <div className="p-2 bg-white/15 text-white border border-white/20 backdrop-blur-sm shadow-[0_0_14px_rgba(255,255,255,0.16)] rounded-xl">
              <MessageSquare className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Ask a Question</span>
              <span className="text-[9px] text-sky-50/90 mt-0.5 font-medium block">Discuss materials with AI</span>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={onOpenQuickUpload}
            className="p-3.5 bg-gradient-to-br from-cyan-500 to-sky-600 border border-cyan-300/60 hover:from-cyan-400 hover:to-sky-500 rounded-2xl text-left transition-all cursor-pointer flex flex-col justify-between items-start gap-4 shadow-[0_0_22px_rgba(6,182,212,0.22)] text-white"
          >
            <div className="p-2 bg-white/15 text-white border border-white/20 backdrop-blur-sm shadow-[0_0_14px_rgba(255,255,255,0.16)] rounded-xl">
              <Upload className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Upload Notes</span>
              <span className="text-[9px] text-slate-400 mt-0.5 font-medium block">Import PDF study files</span>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={onOpenQuickNote}
            className="p-3.5 bg-gradient-to-br from-blue-600 to-indigo-600 border border-blue-300/60 hover:from-blue-500 hover:to-indigo-500 rounded-2xl text-left transition-all cursor-pointer flex flex-col justify-between items-start gap-4 shadow-[0_0_22px_rgba(37,99,235,0.22)] text-white"
          >
            <div className="p-2 bg-white/15 text-white border border-white/20 backdrop-blur-sm shadow-[0_0_14px_rgba(255,255,255,0.16)] rounded-xl">
              <FileEdit className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Create Note</span>
              <span className="text-[9px] text-slate-400 mt-0.5 font-medium block">Draft custom study card</span>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onNavigate('viva')}
            className="p-3.5 bg-gradient-to-br from-sky-600 to-cyan-500 border border-sky-300/60 hover:from-sky-500 hover:to-cyan-400 rounded-2xl text-left transition-all cursor-pointer flex flex-col justify-between items-start gap-4 shadow-[0_0_22px_rgba(14,165,233,0.22)] text-white"
          >
            <div className="p-2 bg-white/15 text-white border border-white/20 backdrop-blur-sm shadow-[0_0_14px_rgba(255,255,255,0.16)] rounded-xl">
              <Mic className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Start Viva</span>
              <span className="text-[9px] text-slate-400 mt-0.5 font-medium block">Oral study practice drill</span>
            </div>
          </motion.button>
        </div>
      </motion.div>

      {/* 6. HISTORICAL ACCOMPLISHMENTS */}
      <motion.div variants={itemVariants} className="space-y-2">
        <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-1">
          Historical Accomplishments
        </h3>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border border-slate-100 p-3 rounded-2xl text-center shadow-sm">
            <span className="text-[18px] font-black text-slate-800 block leading-none">{questionsAskedCount}</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-1">Queries</span>
          </div>
          
          <div className="bg-white border border-slate-100 p-3 rounded-2xl text-center shadow-sm">
            <span className="text-[18px] font-black text-slate-800 block leading-none">{notesCreatedCount}</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-1">Study Cards</span>
          </div>

          <div className="bg-white border border-slate-100 p-3 rounded-2xl text-center shadow-sm">
            <span className="text-[18px] font-black text-slate-800 block leading-none">{materialsUploadedCount}</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-1">Uploads</span>
          </div>
        </div>
      </motion.div>

    </motion.div>
  );
}
