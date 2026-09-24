import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowLeft, BookOpen, Clock, ChevronRight } from 'lucide-react';
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
    <div className="w-full max-w-md mx-auto p-4 space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-500 font-bold text-xs hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </button>

      <div className="space-y-2">
        <h1 className="text-xl font-bold text-slate-800">Smart Revision</h1>
        <p className="text-sm text-slate-500 font-medium">Let Knowva decide what you should revise.</p>
      </div>

      {materials.length === 0 ? (
        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-600">No materials yet.</p>
          <p className="text-xs text-slate-400">Please add study material first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Select Material</label>
            <select 
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
            >
              {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Revision Length</label>
            <div className="grid grid-cols-3 gap-2">
              {[ { label: 'Quick', val: 5 }, { label: 'Standard', val: 10 }, { label: 'Deep', val: 15 } ].map(d => (
                <button
                  key={d.val}
                  onClick={() => setDuration(d.val)}
                  className={`p-2 rounded-xl text-xs font-bold border ${duration === d.val ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  {d.label} ({d.val}m)
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={handleStart}
            disabled={!selectedMaterialId}
            className="w-full py-3 bg-slate-900 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2"
          >
            Start Revision <Sparkles className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
