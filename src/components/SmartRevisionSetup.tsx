import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowLeft, BookOpen, Clock, ChevronRight, Brain } from 'lucide-react';
import { StudyMaterial } from '../types';

interface SmartRevisionSetupProps {
  materials: StudyMaterial[];
  onBack: () => void;
  onStart: (materialId: string, materialTitle: string, duration: number) => void;
}

export default function SmartRevisionSetup({ materials, onBack, onStart }: SmartRevisionSetupProps) {
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(materials.length > 0 ? materials[0].id : '');
  const [duration, setDuration] = useState<number>(10);

  const [isProcessing, setIsProcessing] = useState(false);

  const handleStart = () => {
    if (isProcessing) return;
    const material = materials.find(m => m.id === selectedMaterialId);
    if (material) {
        setIsProcessing(true);
        onStart(material.id, material.name, duration);
    }
  };

  return (
    <motion.div whileHover={{ y: -2, scale: 1.002 }} transition={{ duration: 0.25 }} className="w-full max-w-md mx-auto p-4 space-y-6">

      <div className="text-center space-y-2">
        <motion.div
          initial={{ rotateX: -12, rotateY: 10, y: 4, scale: 0.94, opacity: 0 }}
          animate={{ rotateX: 0, rotateY: 0, y: 0, scale: 1, opacity: 1 }}
          whileHover={{ rotateX: -8, rotateY: 10, y: -3, scale: 1.06 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          style={{ transformPerspective: 700 }}
          className="inline-flex p-3 bg-gradient-to-br from-sky-100 via-white to-cyan-100 text-sky-600 rounded-2xl border border-sky-200 shadow-[0_8px_18px_rgba(14,165,233,0.16)] mb-1"
        >
          <Brain className="h-5.5 w-5.5 drop-shadow-[0_3px_3px_rgba(14,165,233,0.22)]" />
        </motion.div>
        <h1 className="text-lg font-bold text-slate-800 tracking-tight">Adaptive Smart Revision</h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
          Review the concepts that need the most attention through a focused adaptive revision session.
        </p>
      </div>

      {materials.length === 0 ? (
        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-600">No materials yet.</p>
          <p className="text-xs text-slate-400">Please add study material first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <motion.div whileHover={{ y: -1, scale: 1.002 }} transition={{ duration: 0.25 }} className="relative overflow-hidden space-y-2 p-4 rounded-2xl border border-sky-200/80 bg-gradient-to-br from-white via-sky-100/55 to-cyan-100/40 shadow-[0_8px_24px_rgba(14,165,233,0.12)]">
            <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-cyan-200/30 blur-2xl pointer-events-none" />
            <label className="relative text-[10px] font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-sky-500" />
              Select Study Material
            </label>
            <select value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)} className="relative w-full p-3 bg-gradient-to-r from-sky-50 via-white to-cyan-50 border border-sky-100 hover:border-sky-300 rounded-xl text-xs font-bold text-slate-800 shadow-[0_4px_12px_rgba(14,165,233,0.07)] focus:outline-none focus:border-sky-400">
              {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </motion.div>

          <motion.div whileHover={{ y: -1, scale: 1.002 }} transition={{ duration: 0.25 }} className="relative overflow-hidden space-y-2 p-4 rounded-2xl border border-sky-200/80 bg-gradient-to-br from-white via-sky-100/55 to-cyan-100/40 shadow-[0_8px_24px_rgba(14,165,233,0.12)]">
            <div className="absolute -left-8 -bottom-8 h-20 w-20 rounded-full bg-sky-200/30 blur-2xl pointer-events-none" />
            <label className="relative text-[10px] font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-sky-500" />
              Revision Length
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[ { label: 'Quick', val: 5 }, { label: 'Standard', val: 10 }, { label: 'Deep', val: 15 } ].map(d => (
                <motion.button
                  key={d.val}
                  onClick={() => setDuration(d.val)}
                  whileHover={{ y: -1, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 320, damping: 20 }}
                  className={`relative overflow-hidden p-2.5 rounded-xl text-xs font-bold border transition-colors shadow-[0_4px_12px_rgba(14,165,233,0.08)] ${duration === d.val ? 'border-sky-400 text-white shadow-[0_7px_16px_rgba(14,165,233,0.20)]' : 'bg-gradient-to-r from-sky-50 via-white to-cyan-50 border-sky-100 text-slate-700 hover:border-sky-300 hover:shadow-[0_6px_14px_rgba(14,165,233,0.14)]'}`}
                >
                  {duration === d.val && (
                    <motion.span
                      layoutId="revisionDurationActive"
                      className="absolute inset-0 bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{d.label} ({d.val}m)</span>
                </motion.button>
              ))}
            </div>
          </motion.div>

          <motion.button
            onClick={handleStart}
            disabled={!selectedMaterialId || isProcessing}
            whileHover={selectedMaterialId && !isProcessing ? { y: -2, scale: 1.015 } : undefined}
            whileTap={selectedMaterialId && !isProcessing ? { scale: 0.985 } : undefined}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="w-full py-3 bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 hover:from-sky-600 hover:via-blue-700 hover:to-cyan-600 disabled:bg-slate-200 disabled:from-slate-200 disabled:via-slate-200 disabled:to-slate-200 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-[0_8px_18px_rgba(14,165,233,0.26)] border border-sky-400/60 flex items-center justify-center gap-2 group"
          >
            <Sparkles className="h-4 w-4 drop-shadow-[0_2px_3px_rgba(255,255,255,0.25)]" />
            <span>{isProcessing ? 'Starting Revision...' : 'Start Smart Revision'}</span>
            <motion.span whileHover={{ x: 4 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}>
              <ChevronRight className="h-3.5 w-3.5" />
            </motion.span>
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}
