/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithTimeout } from '../utils/apiTimeout';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  BookOpen, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  ArrowRight, 
  RotateCcw, 
  FileText, 
  Award, 
  Info, 
  Send, 
  Loader2,
  Check,
  XCircle,
  HelpCircle,
  Volume2
} from 'lucide-react';
import { StudyMaterial } from '../types';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface VivaSectionProps {
  userId: string;
  uploadedMaterials: StudyMaterial[];
  onNavigateToAsk: () => void;
}

interface QuestionData {
  question: string;
  topic: string;
  difficulty: 'basic' | 'intermediate' | 'advanced' | string;
  questionType?: string;
  targetConcept?: string;
  reason?: string;
  expectedConcepts: string[];
  sourceReferences: Array<{ documentTitle: string; pageNumber?: number | null }>;
}

interface EvaluationData {
  score: number;
  performance: 'strong' | 'partial' | 'weak' | string;
  correctPoints: string[];
  missingPoints: string[];
  incorrectPoints: string[];
  conceptsDemonstrated?: string[];
  conceptsToReview?: string[];
  recommendedDifficulty?: 'basic' | 'intermediate' | 'advanced' | string;
  assessment: string;
  idealAnswer: string;
  importantTerms: string[];
  topic: string;
}

interface HistoryEntry {
  questionNumber: number;
  questionData: QuestionData;
  studentAnswer: string;
  evaluation: EvaluationData;
}

export default function VivaSection({ 
  userId, 
  uploadedMaterials, 
  onNavigateToAsk 
}: VivaSectionProps) {
  // Session Step state: setup | generating | answering | evaluating | feedback | completed | error
  const [step, setStep] = useState<'setup' | 'generating' | 'answering' | 'evaluating' | 'feedback' | 'completed' | 'error'>('setup');
  
  // Selected study material
  const [selectedMaterial, setSelectedMaterial] = useState<StudyMaterial | null>(
    uploadedMaterials.length > 0 ? uploadedMaterials[0] : null
  );

  // Session state
  const [sessionId, setSessionId] = useState<string>('');
  const [currentQuestionNum, setCurrentQuestionNum] = useState<number>(1);
  const [difficultySetup, setDifficultySetup] = useState<'basic' | 'intermediate' | 'advanced'>('intermediate');
  const [currentDifficulty, setCurrentDifficulty] = useState<'basic' | 'intermediate' | 'advanced'>('intermediate');
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [studentAnswer, setStudentAnswer] = useState<string>('');
  const [currentEvaluation, setCurrentEvaluation] = useState<EvaluationData | null>(null);
  const [sessionHistory, setSessionHistory] = useState<HistoryEntry[]>([]);
  
  // Error handling
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [retryFn, setRetryFn] = useState<(() => void) | null>(null);

  // Voice answers V3 states
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [inputMethodUsed, setInputMethodUsed] = useState<'text' | 'voice'>('text');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [finalAssessment, setFinalAssessment] = useState<string>('');
  const spokenEvalRef = useRef<EvaluationData | null>(null);

  const recognitionRef = useRef<any>(null);

  // TTS functionality
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // Try to find a high-quality, natural-sounding voice
      const preferred = voices.find(v => 
        v.lang === 'en-US' && (v.name.includes('Google') || v.name.includes('Natural'))
      ) || voices.find(v => v.lang === 'en-US');
      setSelectedVoice(preferred || null);
    };
    
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    loadVoices();
  }, []);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 0.95; // Slightly slower, more calm pace
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  const getTransition = (performance: string) => {
    const perf = performance.toLowerCase();
    if (perf.includes('strong')) {
      const phrases = ["Good. Let’s take that one step further.", "Nice answer. Now let’s go a little deeper."];
      return phrases[Math.floor(Math.random() * phrases.length)];
    } else if (perf.includes('partial')) {
      const phrases = ["Good start. Let’s explore that a little further.", "You’ve got the main idea. Let’s look at the next part."];
      return phrases[Math.floor(Math.random() * phrases.length)];
    } else {
      const phrases = ["That’s okay. Let’s approach it from another angle.", "No problem. Let’s try a related concept."];
      return phrases[Math.floor(Math.random() * phrases.length)];
    }
  };

  const speakTransition = (evaluation: EvaluationData, nextCallback: () => void) => {
    if (!window.speechSynthesis) {
      nextCallback();
      return;
    }
    const phrase = getTransition(evaluation.performance);
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      nextCallback();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      nextCallback();
    };
    utterance.lang = 'en-US';
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  const getAcknowledgement = (evaluation: EvaluationData) => {
    if (evaluation.correctPoints && evaluation.correctPoints.length > 0) {
      const point = evaluation.correctPoints[Math.floor(Math.random() * evaluation.correctPoints.length)];
      const openers = [
        "I noticed you specifically mentioned",
        "It was good to hear you explain",
        "I liked that you focused on"
      ];
      return `${openers[Math.floor(Math.random() * openers.length)]} ${point}. `;
    }
    return "";
  };

  const speakEvaluation = (evaluation: EvaluationData, studentAnswer: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const acknowledgement = getAcknowledgement(evaluation);
    const text = `${acknowledgement}Your score is ${evaluation.score} out of 100. ${evaluation.assessment}. ${
      evaluation.correctPoints?.length > 0 && !acknowledgement ? 'You correctly identified ' + evaluation.correctPoints.join(', ') + '. ' : ''
    }${evaluation.missingPoints?.length ? 'Concepts that need precision: ' + evaluation.missingPoints.join(', ') + '. ' : ''}${
      evaluation.idealAnswer ? 'The ideal answer is: ' + evaluation.idealAnswer : ''
    }`;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      speakTransition(evaluation, handleNextQuestion);
    };
    utterance.onerror = () => setIsSpeaking(false);
    utterance.lang = 'en-US';
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 0.95; // Calm pace
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (step === 'feedback' && currentEvaluation && currentEvaluation !== spokenEvalRef.current) {
      spokenEvalRef.current = currentEvaluation;
      speakEvaluation(currentEvaluation, studentAnswer);
    }
  }, [step, currentEvaluation, studentAnswer]);

  useEffect(() => {
    if (step === 'answering' && currentQuestion?.question) {
      speak(currentQuestion.question);
    }
    return () => window.speechSynthesis.cancel();
  }, [step, currentQuestion?.question]);

  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setSpeechSupported(false);
    }

    return () => {
      // Cleanup listening instance on unmount
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          console.warn('Error during voice recognition abort on unmount:', e);
        }
      }
    };
  }, []);

  const handleMicToggle = async () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setSpeechSupported(false);
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    setSpeechError(null);
    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      // Capture the base text at the start
      const baseText = studentAnswer.trim();
      let lastFinalTranscript = '';

      recognition.onstart = () => {
        console.log('[SPEECH RECOGNITION START]');
        setIsListening(true);
        setInputMethodUsed('voice');
      };

      recognition.onresult = (event: any) => {
        console.log('[SPEECH RECOGNITION RESULT]');
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        // Merge base text with new final transcripts, appending new final text
        if (finalTranscript) {
          lastFinalTranscript += (lastFinalTranscript ? ' ' : '') + finalTranscript;
        }

        const currentText = baseText + (lastFinalTranscript ? ' ' + lastFinalTranscript : '') + (interimTranscript ? (baseText || lastFinalTranscript ? ' ' : '') + interimTranscript : '');
        setStudentAnswer(currentText);
      };

      recognition.onerror = (event: any) => {
        const error = event.error;
        console.log('[SPEECH RECOGNITION ERROR]', error);
        
        setIsListening(false);

        switch (error) {
          case 'not-allowed':
          case 'permission-denied':
            setSpeechError('Microphone permission denied. Please enable microphone access in your browser settings.');
            break;
          case 'service-not-allowed':
            setSpeechError('Speech recognition service is not allowed.');
            break;
          case 'audio-capture':
            setSpeechError('No microphone detected.');
            break;
          case 'network':
            setSpeechError('Network error during speech recognition.');
            break;
          case 'no-speech':
            setSpeechError('No speech detected.');
            break;
          default:
            setSpeechError('Speech recognition error: ' + error);
        }
      };

      recognition.onend = () => {
        console.log('[SPEECH RECOGNITION END]');
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('[SPEECH START ERROR]', err);
      setSpeechError('Failed to initialize speech recognition. Please type your answer.');
      setIsListening(false);
    }
  };

  // Start a new 5-question Viva Session
  const handleStartSession = async () => {
    if (!selectedMaterial) return;

    const newSessionId = `viva_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setSessionId(newSessionId);
    setCurrentQuestionNum(1);
    setCurrentDifficulty(difficultySetup);
    setSessionHistory([]);
    setStudentAnswer('');
    setCurrentEvaluation(null);

    // Generate first question
    fetchQuestion(newSessionId, 1, selectedMaterial, [], difficultySetup);
  };

  // Call backend to generate an adaptive question
  const fetchQuestion = async (
    sId: string, 
    qNum: number, 
    mat: StudyMaterial, 
    history: HistoryEntry[],
    targetDifficulty: 'basic' | 'intermediate' | 'advanced'
  ) => {
    setStep('generating');
    setErrorMessage('');
    setStudentAnswer('');
    setCurrentEvaluation(null);
    setInputMethodUsed('text');
    setSpeechError(null);

    const previousQuestions = history.map(h => h.questionData.question);

    const previousEvaluations = history.map(h => ({
      question: h.questionData.question,
      studentAnswer: h.studentAnswer,
      score: h.evaluation.score,
      performance: h.evaluation.performance,
      correctPoints: h.evaluation.correctPoints,
      missingPoints: h.evaluation.missingPoints,
      incorrectPoints: h.evaluation.incorrectPoints,
      conceptsDemonstrated: h.evaluation.conceptsDemonstrated || [],
      conceptsToReview: h.evaluation.conceptsToReview || [],
      recommendedDifficulty: h.evaluation.recommendedDifficulty || targetDifficulty,
      targetConcept: h.questionData.targetConcept || h.questionData.topic || '',
      questionType: h.questionData.questionType || '',
      topic: h.evaluation.topic || h.questionData.topic
    }));

    const conceptsTested = Array.from(new Set(
      history.flatMap(h => [h.questionData.targetConcept || '', ...(h.evaluation.conceptsDemonstrated || [])]).filter(Boolean)
    ));

    const conceptsNeedingReview = Array.from(new Set(
      history.flatMap(h => [...(h.evaluation.conceptsToReview || []), ...(h.evaluation.missingPoints || [])]).filter(Boolean)
    ));

    const executeFetch = async () => {
      try {
        const response = await fetchWithTimeout('/api/viva/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            documentId: mat.id,
            documentTitle: mat.name,
            questionNumber: qNum,
            currentDifficulty: targetDifficulty,
            previousQuestions,
            previousEvaluations,
            conceptsTested,
            conceptsNeedingReview
          })
        }, 90000);

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Failed to generate oral question from study material.');
        }

        const qData: QuestionData = data.data;
        setCurrentQuestion(qData);
        if (qData.difficulty && ['basic', 'intermediate', 'advanced'].includes(qData.difficulty.toLowerCase())) {
          setCurrentDifficulty(qData.difficulty.toLowerCase() as any);
        }
        setStep('answering');
      } catch (err: any) {
        console.error('[VIVA UI ERROR] Question generation failed:', err);
        setErrorMessage(err.message || 'Temporary AI service disruption. Please try again.');
        setRetryFn(() => () => fetchQuestion(sId, qNum, mat, history, targetDifficulty));
        setStep('error');
      }
    };

    executeFetch();
  };

  // Submit student answer for evaluation
  const handleSubmitAnswer = async () => {
    if (!studentAnswer.trim() || !currentQuestion || !selectedMaterial || step === 'evaluating') return;

    setStep('evaluating');
    setErrorMessage('');

    const executeEval = async () => {
      try {
        const response = await fetchWithTimeout('/api/viva/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            sessionId,
            question: currentQuestion.question,
            studentAnswer: studentAnswer.trim(),
            expectedConcepts: currentQuestion.expectedConcepts,
            documentTitle: selectedMaterial.name,
            documentId: selectedMaterial.id
          })
        }, 60000);

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Failed to evaluate answer against study material.');
        }

        const evalResult: EvaluationData = data.data;
        setCurrentEvaluation(evalResult);

        // Update current difficulty for next question based on recommendation
        if (evalResult.recommendedDifficulty && ['basic', 'intermediate', 'advanced'].includes(evalResult.recommendedDifficulty.toLowerCase())) {
          setCurrentDifficulty(evalResult.recommendedDifficulty.toLowerCase() as any);
        }

        // Add to history entry
        const newEntry: HistoryEntry = {
          questionNumber: currentQuestionNum,
          questionData: currentQuestion,
          studentAnswer: studentAnswer.trim(),
          evaluation: evalResult
        };

        const updatedHistory = [...sessionHistory, newEntry];
        setSessionHistory(updatedHistory);

        // Save comprehensive response record to Firestore
        try {
          await addDoc(collection(db, 'vivaResponses'), {
            sessionId,
            userId,
            questionNumber: currentQuestionNum,
            question: currentQuestion.question,
            studentAnswer: studentAnswer.trim(),
            score: evalResult.score,
            performance: evalResult.performance || (evalResult.score >= 80 ? 'strong' : evalResult.score >= 60 ? 'partial' : 'weak'),
            difficulty: currentQuestion.difficulty || currentDifficulty,
            targetConcept: currentQuestion.targetConcept || currentQuestion.topic || '',
            questionType: currentQuestion.questionType || 'follow_up',
            assessment: evalResult.assessment,
            correctPoints: evalResult.correctPoints || [],
            missingPoints: evalResult.missingPoints || [],
            incorrectPoints: evalResult.incorrectPoints || [],
            conceptsDemonstrated: evalResult.conceptsDemonstrated || [],
            conceptsToReview: evalResult.conceptsToReview || [],
            topic: evalResult.topic || currentQuestion.topic,
            createdAt: new Date().toISOString(),
            documentTitle: selectedMaterial.name,
            documentId: selectedMaterial.id,
            inputMethod: inputMethodUsed
          });
        } catch (fsErr) {
          console.warn('[VIVA FIRESTORE WARNING] Non-blocking response write failed:', fsErr);
        }

        setStep('feedback');
      } catch (err: any) {
        console.error('[VIVA UI ERROR] Answer evaluation failed:', err);
        setErrorMessage(err.message || 'Temporary evaluation failure. Please retry submission.');
        setRetryFn(() => () => handleSubmitAnswer());
        setStep('error');
      }
    };

    executeEval();
  };

  // Move to next question or complete session
  const handleNextQuestion = () => {
    if (!selectedMaterial || isSpeaking) return;

    if (currentQuestionNum >= 5) {
      completeSession();
    } else {
      const nextNum = currentQuestionNum + 1;
      setCurrentQuestionNum(nextNum);
      const nextDiff = currentEvaluation?.recommendedDifficulty as any || currentDifficulty;
      fetchQuestion(sessionId, nextNum, selectedMaterial, sessionHistory, nextDiff);
    }
  };

  // Complete session and save summary to Firestore
  const completeSession = async () => {
    if (!selectedMaterial) return;

    const totalScoreSum = sessionHistory.reduce((acc, h) => acc + h.evaluation.score, 0);
    const finalScore = sessionHistory.length > 0 ? Math.round(totalScoreSum / sessionHistory.length) : 0;

    const strongAreasSet = new Set<string>();
    const weakAreasSet = new Set<string>();
    const topicsSet = new Set<string>();

    sessionHistory.forEach(h => {
      if (h.evaluation.topic) topicsSet.add(h.evaluation.topic);
      if (h.evaluation.score >= 75) {
        if (h.evaluation.topic) strongAreasSet.add(h.evaluation.topic);
        h.evaluation.correctPoints.forEach(p => strongAreasSet.add(p));
      } else {
        if (h.evaluation.topic) weakAreasSet.add(h.evaluation.topic);
        h.evaluation.missingPoints.forEach(p => weakAreasSet.add(p));
      }
    });

    const strongAreas = Array.from(strongAreasSet).slice(0, 5);
    const weakAreas = Array.from(weakAreasSet).slice(0, 5);
    
    const summary = `You achieved an overall score of ${finalScore} percent. You showed strong understanding in areas like ${strongAreas.join(', ')}. To reach the next level, focus on ${weakAreas.join(', ')}. Keep practicing!`;
    setFinalAssessment(summary);
    
    setStep('completed');

    // ... existing firestore save ...

    // Save session summary to Firestore
    try {
      await setDoc(doc(db, 'vivaSessions', sessionId), {
        id: sessionId,
        userId,
        documentId: selectedMaterial.id,
        documentTitle: selectedMaterial.name,
        startedAt: new Date(Date.now() - 300000).toISOString(),
        completedAt: new Date().toISOString(),
        totalQuestions: sessionHistory.length,
        finalScore,
        topics: [selectedMaterial.name],
        strongAreas,
        weakAreas
      });

      // Log activity
      await addDoc(collection(db, 'activity'), {
        userId,
        type: 'viva',
        description: `Completed Viva drill on "${selectedMaterial.name}" (Score: ${finalScore}%)`,
        timestamp: new Date().toISOString()
      });
    } catch (fsErr) {
      console.warn('[VIVA FIRESTORE WARNING] Non-blocking session completion write failed:', fsErr);
    }
  };

  // Reset to setup
  const handleReset = () => {
    setStep('setup');
    setSessionId('');
    setCurrentQuestionNum(1);
    setCurrentQuestion(null);
    setStudentAnswer('');
    setCurrentEvaluation(null);
    setSessionHistory([]);
    setErrorMessage('');
  };

  // Render Setup Screen
  if (step === 'setup') {
    return (
      <div className="max-w-xl mx-auto px-4 py-4 sm:py-8 space-y-6 pb-24 text-left font-sans">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-sky-50 text-sky-600 rounded-2xl border border-sky-100 shadow-sm mb-1">
            <Mic className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">Adaptive Oral Viva Drill</h1>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
            Test your understanding through a 5-question oral examination grounded strictly in your syllabus.
          </p>
        </div>

        {/* Source Material Selector */}
        <div className="p-5 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
          <h3 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-sky-500" />
            <span>Select Syllabus Source Material</span>
          </h3>

          {uploadedMaterials.length === 0 ? (
            <div className="p-4 bg-sky-50/50 border border-sky-100 rounded-xl text-center space-y-2">
              <p className="text-xs text-slate-600 font-semibold">
                No syllabus materials uploaded yet. Upload a document in Study Materials to start Viva Practice.
              </p>
              <button 
                onClick={onNavigateToAsk}
                className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer border-none inline-flex items-center gap-1"
              >
                <span>Go to Workspace</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {uploadedMaterials.map(mat => {
                const isSelected = selectedMaterial?.id === mat.id;
                return (
                  <div
                    key={mat.id}
                    onClick={() => setSelectedMaterial(mat)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected 
                        ? 'bg-sky-50/80 border-sky-300 shadow-sm' 
                        : 'bg-slate-50/60 border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className={`h-4 w-4 shrink-0 ${isSelected ? 'text-sky-600' : 'text-slate-400'}`} />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 truncate block">{mat.name}</span>
                        <span className="text-[10px] text-slate-400 font-semibold block">
                          {mat.type.toUpperCase()} • {mat.fileSize || 'Syllabus Source'}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drill Specs Card */}
        <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-extrabold text-slate-800 uppercase tracking-wider">
            <Sparkles className="h-4 w-4 text-sky-500" />
            <span>Oral Examination Parameters</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] text-slate-400 font-bold block uppercase">Select Difficulty</label>
              <div className="grid grid-cols-3 gap-2">
                {(['basic', 'intermediate', 'advanced'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setDifficultySetup(level)}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      difficultySetup === level
                        ? 'bg-sky-50 border-sky-300 text-sky-700'
                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200'
                    }`}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[9px] text-slate-400 font-bold block uppercase">Length</span>
                <span className="text-xs font-extrabold text-slate-800">5 Questions</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[9px] text-slate-400 font-bold block uppercase">Focus</span>
                <span className="text-xs font-extrabold text-slate-800">Syllabus Grounded</span>
              </div>
            </div>
          </div>
        </div>

        {/* Start Button */}
        <div className="text-center pt-2">
          <button
            onClick={handleStartSession}
            disabled={!selectedMaterial}
            className="w-full py-3 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-200 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-md shadow-sky-500/10 border-none flex items-center justify-center gap-2"
          >
            <Mic className="h-4 w-4" />
            <span>Start Oral Viva Drill (5 Questions)</span>
          </button>
        </div>
      </div>
    );
  }

  // Render Question Generation State
  if (step === 'generating') {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center font-sans space-y-4">
        <div className="p-8 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4 max-w-md mx-auto">
          <div className="inline-flex items-center justify-center p-3 bg-sky-50 text-sky-600 rounded-2xl">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <h2 className="text-sm font-bold text-slate-800">Formulating Question {currentQuestionNum} of 5</h2>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Analyzing concepts from <span className="text-sky-600 font-bold">"{selectedMaterial?.name}"</span> and tailoring adaptive challenge level...
          </p>
        </div>
      </div>
    );
  }

  // Render Answer Evaluation State
  if (step === 'evaluating') {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center font-sans space-y-4">
        <div className="p-8 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4 max-w-md mx-auto">
          <div className="inline-flex items-center justify-center p-3 bg-sky-50 text-sky-600 rounded-2xl">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <h2 className="text-sm font-bold text-slate-800">Evaluating Your Response</h2>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Comparing your explanation against syllabus definitions, key mechanisms, and technical terms...
          </p>
        </div>
      </div>
    );
  }

  // Render Error State
  if (step === 'error') {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 text-center font-sans space-y-4">
        <div className="p-6 bg-white border border-rose-100 rounded-2xl shadow-sm space-y-3 max-w-md mx-auto">
          <div className="inline-flex items-center justify-center p-3 bg-rose-50 text-rose-600 rounded-2xl">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-bold text-slate-800">Temporary AI Examiner Failure</h2>
          <p className="text-xs text-rose-600 font-semibold leading-relaxed">
            {errorMessage || 'The AI service is temporarily busy. Please try again.'}
          </p>
          <div className="pt-2 flex justify-center gap-2">
            {retryFn && (
              <button
                onClick={retryFn}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl transition-colors border-none cursor-pointer inline-flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retry Action</span>
              </button>
            )}
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors border-none cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Answering Question State
  if (step === 'answering' && currentQuestion) {
    return (
      <div className="max-w-xl mx-auto px-4 py-4 sm:py-8 space-y-5 pb-24 text-left font-sans">
        {/* Step Progress Bar */}
        <div className="flex items-center justify-between flex-wrap gap-1.5 text-xs font-bold text-slate-500">
          <span>Question {currentQuestionNum} of 5</span>
          <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full text-[10px] capitalize font-extrabold border border-sky-100 flex items-center gap-1 min-w-0 max-w-[200px] sm:max-w-xs truncate">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              currentQuestion.difficulty === 'advanced' ? 'bg-purple-500' :
              currentQuestion.difficulty === 'basic' ? 'bg-emerald-500' : 'bg-sky-500'
            }`} />
            <span className="truncate">{currentQuestion.difficulty || 'Intermediate'}</span>
            <span className="text-slate-300">•</span>
            <span className="truncate">{currentQuestion.topic || 'General'}</span>
          </span>
        </div>

        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-sky-500 rounded-full transition-all duration-300"
            style={{ width: `${(currentQuestionNum / 5) * 100}%` }}
          />
        </div>

        {/* Question Prompt Card */}
        <div className="p-5 bg-white border border-slate-100 rounded-2xl space-y-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            <HelpCircle className="h-3.5 w-3.5 text-sky-500" />
            <span>Oral Examiner Question</span>
          </div>

          <h2 className="text-sm sm:text-base font-bold text-slate-800 leading-snug">
            "{currentQuestion.question}"
            <button
              onClick={() => speak(currentQuestion.question)}
              className="ml-2 p-1 text-slate-400 hover:text-sky-500 transition-colors inline-block"
              title="Replay question"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </h2>

          <div className="text-[10px] text-slate-400 font-semibold pt-1 border-t border-slate-50 flex items-center gap-1">
            <BookOpen className="h-3 w-3 text-sky-500" />
            <span>Source: {selectedMaterial?.name}</span>
          </div>
        </div>

        {/* Student Response Area */}
        <div className="p-5 bg-white border border-slate-100 rounded-2xl space-y-3 shadow-sm">
          <label className="block text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
            Your Spoken/Typed Explanation
          </label>

          <textarea
            rows={5}
            value={studentAnswer}
            onChange={(e) => setStudentAnswer(e.target.value)}
            placeholder="Type your explanation here. Be specific about key terms, steps, and mechanisms..."
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white transition-all resize-none"
          />

          <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 font-semibold">
            <span>{studentAnswer.trim().length} characters</span>
            <button
              onClick={handleMicToggle}
              className={`flex items-center gap-1 transition-colors ${
                isListening ? 'text-sky-600' : 'text-sky-500 hover:text-sky-700'
              }`}
            >
              <Mic className={`h-3 w-3 ${isListening ? 'animate-pulse' : ''}`} />
              {isListening ? 'Listening...' : 'Speak Answer'}
            </button>
            <span>Ground answer in syllabus definitions</span>
          </div>

          {speechError && (
            <div className="text-[10px] text-red-500 font-semibold pt-1 border-t border-slate-50 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              <span>{speechError}</span>
            </div>
          )}

          {!speechSupported && (
            <div className="text-[10px] text-slate-400 font-semibold pt-1 border-t border-slate-50 flex items-center gap-1">
              <Info className="h-3 w-3" />
              <span>Voice input isn't supported in this browser. You can type your answer instead.</span>
            </div>
          )}
        </div>

        {/* Submit Action */}
        <button
          onClick={handleSubmitAnswer}
          disabled={!studentAnswer.trim()}
          className="w-full py-3 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-200 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-md shadow-sky-500/10 border-none flex items-center justify-center gap-2"
        >
          <Send className="h-4 w-4" />
          <span>Submit Answer for Evaluation</span>
        </button>
      </div>
    );
  }

  // Render Evaluation Feedback State
  if (step === 'feedback' && currentEvaluation && currentQuestion) {
    const isHigh = currentEvaluation.score >= 80;
    const isMedium = currentEvaluation.score >= 60 && currentEvaluation.score < 80;

    return (
      <div className="max-w-xl mx-auto px-4 py-4 sm:py-8 space-y-5 pb-24 text-left font-sans">
        {/* Score Header Card */}
        <div className="p-5 bg-white border border-slate-100 rounded-2xl space-y-3 shadow-sm text-center">
          <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs font-extrabold tracking-wide mb-1"
            style={{
              backgroundColor: isHigh ? '#ecfdf5' : isMedium ? '#f0f9ff' : '#fff1f2',
              color: isHigh ? '#047857' : isMedium ? '#0369a1' : '#be123c'
            }}
          >
            <span>Score: {currentEvaluation.score} / 100</span>
          </div>

          <h2 className="text-sm font-bold text-slate-800">
            {currentEvaluation.assessment}
          </h2>
        </div>

        {/* Feedback Details */}
        <div className="p-5 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
          {/* Correct Points */}
          {currentEvaluation.correctPoints && currentEvaluation.correctPoints.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>What You Answered Correctly</span>
              </span>
              <ul className="space-y-1 pl-4 list-disc text-xs text-slate-700 font-semibold leading-relaxed">
                {currentEvaluation.correctPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing Points */}
          {currentEvaluation.missingPoints && currentEvaluation.missingPoints.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                <span>Concepts Missed or Requiring Precision</span>
              </span>
              <ul className="space-y-1 pl-4 list-disc text-xs text-slate-700 font-semibold leading-relaxed">
                {currentEvaluation.missingPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Incorrect Points */}
          {currentEvaluation.incorrectPoints && currentEvaluation.incorrectPoints.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-extrabold text-rose-700 uppercase tracking-wider flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-rose-500" />
                <span>Factual Misconceptions Identified</span>
              </span>
              <ul className="space-y-1 pl-4 list-disc text-xs text-slate-700 font-semibold leading-relaxed">
                {currentEvaluation.incorrectPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Ideal Answer */}
          {currentEvaluation.idealAnswer && (
            <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-xl space-y-1 pt-2">
              <span className="text-[10px] font-extrabold text-sky-800 uppercase tracking-wider block">
                Model Ideal Answer
              </span>
              <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                "{currentEvaluation.idealAnswer}"
              </p>
            </div>
          )}

          {/* Key Terms */}
          {currentEvaluation.importantTerms && currentEvaluation.importantTerms.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Key Terminology
              </span>
              <div className="flex flex-wrap gap-1.5">
                {currentEvaluation.importantTerms.map((term, i) => (
                  <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold">
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={handleNextQuestion}
          disabled={isSpeaking}
          className={`w-full py-3 bg-sky-500 hover:bg-sky-600 ${isSpeaking ? 'opacity-50 cursor-not-allowed' : ''} text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-md shadow-sky-500/10 border-none flex items-center justify-center gap-2`}
        >
          <span>{currentQuestionNum >= 5 ? 'View Session Summary →' : 'Proceed to Next Question →'}</span>
        </button>
      </div>
    );
  }

  // Render Completion Summary State
  if (step === 'completed') {
    const totalScoreSum = sessionHistory.reduce((acc, h) => acc + h.evaluation.score, 0);
    const avgScore = sessionHistory.length > 0 ? Math.round(totalScoreSum / sessionHistory.length) : 0;

    const strongPoints = sessionHistory
      .flatMap(h => h.evaluation.correctPoints)
      .slice(0, 4);

    const weakPoints = sessionHistory
      .flatMap(h => h.evaluation.missingPoints)
      .slice(0, 4);

    return (
      <div className="max-w-xl mx-auto px-4 py-4 sm:py-8 space-y-6 pb-24 text-left font-sans">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-sky-50 text-sky-600 rounded-2xl border border-sky-100 shadow-sm mb-1">
            <Award className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">Viva Drill Session Complete!</h1>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
            Finished 5 oral questions grounded in <span className="text-sky-600 font-bold">"{selectedMaterial?.name}"</span>.
          </p>
        </div>

        {/* Teacher Assessment */}
        <div className="p-5 bg-white border border-slate-100 rounded-2xl space-y-3 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold text-sky-800 uppercase tracking-wider">Teacher Summary</span>
            <button onClick={() => speak(finalAssessment)} className="p-1.5 text-sky-500 hover:text-sky-700 transition-colors" title="Read summary aloud">
               <Volume2 className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-slate-700 font-semibold leading-relaxed">
            {finalAssessment}
          </p>
        </div>

        {/* Overall Score Card */}
        <div className="p-5 bg-white border border-slate-100 rounded-2xl text-center space-y-2 shadow-sm">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block">Average Precision Score</span>
          <span className="text-2xl font-extrabold text-sky-600 block">{avgScore}%</span>
          <p className="text-xs text-slate-500 font-semibold max-w-xs mx-auto">
            {avgScore >= 80 ? 'Outstanding oral precision! Excellent mastery of syllabus mechanisms.' :
             avgScore >= 60 ? 'Good grasp of core concepts. Review missed details to sharpen accuracy.' :
             'Syllabus review recommended. Focus on core definitions and key steps.'}
          </p>
        </div>

        {/* Strong vs Weak Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-2 shadow-sm">
            <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>Strong Concepts</span>
            </span>
            {strongPoints.length > 0 ? (
              <ul className="space-y-1 pl-3 list-disc text-[11px] text-slate-700 font-semibold">
                {strongPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-400 font-semibold">Keep practicing to build strong points.</p>
            )}
          </div>

          <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-2 shadow-sm">
            <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              <span>Revision Focus Areas</span>
            </span>
            {weakPoints.length > 0 ? (
              <ul className="space-y-1 pl-3 list-disc text-[11px] text-slate-700 font-semibold">
                {weakPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-400 font-semibold">No major gaps identified!</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-2">
          <button
            onClick={handleReset}
            className="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-md shadow-sky-500/10 border-none flex items-center justify-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Start Another Viva Drill</span>
          </button>

          <button
            onClick={onNavigateToAsk}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer border-none"
          >
            Return to Workspace
          </button>
        </div>
      </div>
    );
  }

  return null;
}
