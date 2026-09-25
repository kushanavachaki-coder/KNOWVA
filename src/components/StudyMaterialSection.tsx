/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithTimeout } from '../utils/apiTimeout';
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  Loader2, 
  FileUp,
  ClipboardList
} from 'lucide-react';
import { StudyMaterial } from '../types';

// Load PDF.js dynamically from CDN to avoid node-gyp build issues in sandboxed environment
const loadPdfJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF parsing runtime. Please check connection.'));
    document.body.appendChild(script);
  });
};

const extractTextFromPdf = async (
  file: File, 
  onProgress: (pct: number) => void
): Promise<{ text: string; pageNumber: number }[]> => {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pages: { text: string; pageNumber: number }[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    pages.push({
      text: pageText,
      pageNumber: i
    });
    onProgress(Math.round((i / numPages) * 100));
  }

  return pages;
};

interface StudyMaterialSectionProps {
  userId: string;
  materials: StudyMaterial[];
  onAddMaterial: (material: StudyMaterial, diagnostics?: any) => void;
  onRemoveMaterial: (id: string) => void;
}

type ModeType = 'none' | 'pdf' | 'text';

export default function StudyMaterialSection({ 
  userId,
  materials, 
  onAddMaterial, 
  onRemoveMaterial 
}: StudyMaterialSectionProps) {
  const [activeMode, setActiveMode] = useState<ModeType>('none');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingName, setUploadingName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  // Paste text form state
  const [pastedTitle, setPastedTitle] = useState<string>('');
  const [pastedContent, setPastedContent] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setErrorMessage('');
    
    if (file.type !== "application/pdf" && !file.name.endsWith('.pdf')) {
      setErrorMessage("Please select a PDF document (.pdf format only).");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage("File size limit is 20MB.");
      return;
    }

    setUploadingName(file.name);
    setUploadProgress(0);

    try {
      // Extract text content page-by-page dynamically
      const pages = await extractTextFromPdf(file, (progress) => {
        setUploadProgress(progress);
      });

      // Submit page chunks to indexer API with 60s timeout
      const res = await fetchWithTimeout("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: file.name,
          type: "pdf",
          pages,
          userId: userId
        })
      }, 60000);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to process PDF content");
      }

      const data = await res.json();
      if (data.success) {
        // Trigger callback to parent (local Firestore snapshot handles sync, but adding to state ensures instant preview robustness)
        onAddMaterial(data.document, data.diagnostics);
        setTimeout(() => {
          setUploadProgress(null);
          setUploadingName('');
          setActiveMode('none');
        }, 300);
      }
    } catch (err: any) {
      console.error(err);
      setUploadProgress(null);
      setUploadingName('');
      setErrorMessage(err.message || "An error occurred during PDF text extraction.");
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!pastedTitle.trim()) {
      setErrorMessage("Please enter a title for your notes.");
      return;
    }
    if (!pastedContent.trim() || pastedContent.trim().length < 20) {
      setErrorMessage("Please paste at least 20 characters of study notes.");
      return;
    }

    setIsProcessing(true);

    try {
      const res = await fetchWithTimeout("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pastedTitle.trim(),
          type: "text",
          content: pastedContent.trim(),
          userId: userId
        })
      }, 60000);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to process plain text");
      }

      const data = await res.json();
      if (data.success) {
        onAddMaterial(data.document, data.diagnostics);
        setPastedTitle('');
        setPastedContent('');
        setActiveMode('none');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "An error occurred while indexing your notes.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div id="study-material-section" whileHover={{ y: -2, scale: 1.002 }} transition={{ duration: 0.25 }} className="w-full bg-gradient-to-br from-white via-sky-100/55 to-cyan-100/40 border border-sky-200/80 rounded-2xl p-4 shadow-[0_8px_24px_rgba(14,165,233,0.12)] text-left relative overflow-hidden">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-sky-700 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-ping"></span>
            ACTIVE STUDY MATERIALS
          </h2>
          <p className="text-[10px] text-slate-500 font-semibold leading-normal">
            Upload PDF materials or paste notes to build your custom session context.
          </p>
        </div>

        {/* Action button toggles */}
        <div className="flex items-center gap-1.5 shrink-0 bg-white/80 p-1 rounded-xl border border-sky-200/80 shadow-[0_3px_10px_rgba(14,165,233,0.10)]">
          <motion.button
            whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.96 }}
            onClick={() => { setActiveMode(activeMode === 'pdf' ? 'none' : 'pdf'); setErrorMessage(''); }}
            className={`px-3 py-1.5 text-[9px] font-bold tracking-wider uppercase rounded-xl transition-all duration-200 cursor-pointer border flex items-center gap-1 ${
              activeMode === 'pdf'
                ? 'bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 text-white border-sky-500 shadow-[0_5px_14px_rgba(14,165,233,0.22)]'
                : 'bg-white/80 text-slate-600 border-sky-100/70 hover:bg-sky-50 hover:text-sky-700'
            }`}
          >
            <FileUp className="h-3 w-3" />
            <span>+ PDF</span>
          </motion.button>
          
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { setActiveMode(activeMode === 'text' ? 'none' : 'text'); setErrorMessage(''); }}
            className={`px-3 py-1.5 text-[9px] font-bold tracking-wider uppercase rounded-xl transition-all duration-200 cursor-pointer border flex items-center gap-1 ${
              activeMode === 'text'
                ? 'bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-500/10'
                : 'bg-slate-50 text-slate-600 border-slate-200/60 hover:bg-slate-100'
            }`}
          >
            <ClipboardList className="h-3 w-3" />
            <span>+ Paste Notes</span>
          </motion.button>
        </div>
      </div>

      {/* Inputs with smooth motion */}
      <AnimatePresence mode="wait">
        
        {activeMode === 'pdf' && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-3 pt-3 border-t border-slate-100"
          >
            {uploadProgress !== null ? (
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center">
                <Loader2 className="h-5 w-5 text-sky-500 animate-spin mx-auto mb-2" />
                <span className="text-[10px] font-bold text-slate-800 block truncate px-2">Indexing "{uploadingName}"...</span>
                <div className="w-full max-w-xs bg-slate-200 rounded-full h-1 mt-2 mx-auto overflow-hidden">
                  <div className="bg-sky-500 h-full rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              </div>
            ) : (
              <div 
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-sky-500 bg-sky-50/30 text-sky-700' 
                    : 'border-slate-200 hover:border-sky-400 bg-slate-50/50 text-slate-500'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".pdf,application/pdf"
                  className="hidden" 
                />
                <Upload className="h-5 w-5 text-slate-400 mx-auto mb-1.5" />
                <p className="text-xs text-slate-700 font-bold">Drop study PDF here or tap to select</p>
                <p className="text-[9px] text-slate-400 mt-0.5 font-semibold">Supports curriculum PDF notes up to 20MB</p>
              </div>
            )}
          </motion.div>
        )}

        {activeMode === 'text' && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-3 pt-3 border-t border-slate-100"
          >
            <form onSubmit={handlePasteSubmit} className="space-y-2.5">
              <input 
                type="text"
                placeholder="Study Notes Title (e.g., Photosynthesis Lecture)"
                value={pastedTitle}
                onChange={(e) => setPastedTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all"
              />
              <textarea 
                placeholder="Paste active lecture slides, syllabus guidelines, or reference text details here..."
                value={pastedContent}
                onChange={(e) => setPastedContent(e.target.value)}
                className="w-full h-24 px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:border-sky-500 focus:bg-white transition-all resize-none"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveMode('none')}
                  className="px-3 py-1.5 bg-transparent hover:bg-slate-50 text-slate-500 text-[10px] font-bold rounded-lg transition-colors cursor-pointer animate-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm cursor-pointer border-none flex items-center gap-1 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Indexing...</span>
                    </>
                  ) : (
                    <span>Add Material</span>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}

      </AnimatePresence>

      {/* List Active Documents */}
      {materials.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          <span className="text-[9px] text-sky-600/80 uppercase tracking-widest block font-bold">
            Active Study Scope ({materials.length})
          </span>
          <div className="flex flex-wrap gap-1.5">
            {materials.map((m) => (
              <motion.div 
                whileHover={{ scale: 1.01 }}
                key={m.id} 
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/85 border border-sky-100 rounded-xl text-[11px] text-slate-700 max-w-[200px] min-w-0 shadow-[0_2px_8px_rgba(14,165,233,0.06)]"
              >
                <FileText className={`h-3.5 w-3.5 shrink-0 ${m.type === 'pdf' ? 'text-red-500' : 'text-amber-500'}`} />
                <span className="truncate min-w-0 font-semibold text-slate-700">{m.name}</span>
                <button
                  onClick={() => onRemoveMaterial(m.id)}
                  className="text-slate-400 hover:text-red-600 transition-colors ml-1 font-bold focus:outline-none text-sm cursor-pointer"
                  title="Unindex material"
                >
                  &times;
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mt-2.5 bg-rose-50 border border-rose-100 p-2 rounded-xl text-[10px] text-rose-600 flex items-center gap-1.5 font-bold">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

    </motion.div>
  );
}
