import { fetchWithTimeout } from '../utils/apiTimeout';
import React, { useState, useEffect, useRef } from 'react';
import { SmartRevisionSession, StudyMaterial } from '../types';
import SmartRevisionSetup from './SmartRevisionSetup';
import { BookOpen, Sparkles, AlertCircle, Loader2, ArrowLeft, Bookmark, CheckCircle2, HelpCircle, XCircle, Mic, MicOff, Volume2, FileText, Save } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function SmartRevisionSection({ userId, materials, onBack }: { userId: string, materials: StudyMaterial[], onBack: () => void }) {
  const [step, setStep] = useState<'setup' | 'loading' | 'focus' | 'session' | 'evaluating' | 'completed' | 'error'>('setup');
  const [session, setSession] = useState<SmartRevisionSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentConceptIdx, setCurrentConceptIdx] = useState(0);

  // Question & Answer state
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [studentAnswer, setStudentAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<any>(null);

  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Revision Note state
  const [generatingNote, setGeneratingNote] = useState(false);
  const [revisionNote, setRevisionNote] = useState<any | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  // Session history storage
  const [completedConcepts, setCompletedConcepts] = useState<any[]>([]);
  const sessionSavedRef = useRef(false);

  useEffect(() => {
    if (step === 'completed' && session && !sessionSavedRef.current) {
      sessionSavedRef.current = true;
      fetchWithTimeout("/api/revision/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          materialId: session.materialId,
          materialTitle: session.materialTitle,
          sessionId: session.id,
          duration: session.duration,
          conceptsCovered: completedConcepts,
          startedAt: session.startTime
        })
      }).catch(err => console.error("Failed to save completed revision session:", err));
    }
  }, [step, session, completedConcepts, userId]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleStart = async (materialId: string, materialTitle: string, duration: number) => {
    setStep('loading');
    setErrorMessage(null);
    sessionSavedRef.current = false;
    setRevisionNote(null);
    setNoteSaved(false);
    try {
      if (!materialId || !materialTitle) {
        throw new Error("Please select a valid study material.");
      }
      const sess: SmartRevisionSession = {
        id: crypto.randomUUID(),
        userId,
        materialId,
        materialTitle,
        duration,
        startTime: new Date()
      };

      const response = await fetchWithTimeout("/api/revision/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, materialId, duration })
      }, 60000);

      if (!response.ok) {
        throw new Error("Failed to generate revision plan. Please try again.");
      }

      const data = await response.json();
      if (!data.plan || !data.plan.concepts || data.plan.concepts.length === 0) {
        throw new Error("Received empty revision plan from server.");
      }

      setSession({ ...sess, plan: data.plan });
      setCurrentConceptIdx(0);
      setCompletedConcepts([]);
      setStep('focus');
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to generate revision plan.");
      setStep('error');
    }
  };

  const fetchQuestionForConcept = async (concept: any) => {
    if (!session) return;
    setLoadingQuestion(true);
    setCurrentQuestion(null);
    setStudentAnswer('');
    setEvaluation(null);
    setSpeechError(null);
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    try {
      const res = await fetchWithTimeout("/api/revision/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, materialId: session.materialId })
      }, 60000);
      const data = await res.json();
      setCurrentQuestion(data);
    } catch (err) {
      console.error("Failed to load question", err);
    } finally {
      setLoadingQuestion(false);
    }
  };

  const handleContinueToSession = () => {
    setStep('session');
    if (session?.plan?.concepts && session.plan.concepts.length > 0) {
      fetchQuestionForConcept(session.plan.concepts[0]);
    }
  };

  const handleMicToggle = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setSpeechError("Speech recognition is not supported in this browser.");
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
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognitionRef.current = recognition;

      const baseText = studentAnswer.trim();
      let lastFinalTranscript = '';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          lastFinalTranscript += (lastFinalTranscript ? ' ' : '') + finalTranscript;
        }

        const currentText = baseText + (lastFinalTranscript ? ' ' + lastFinalTranscript : '') + (interimTranscript ? (baseText || lastFinalTranscript ? ' ' : '') + interimTranscript : '');
        setStudentAnswer(currentText);
      };

      recognition.onerror = (event: any) => {
        const error = event.error;
        setIsListening(false);
        if (error !== 'aborted' && error !== 'no-speech') {
          setSpeechError(`Speech error: ${error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err: any) {
      setIsListening(false);
      setSpeechError("Could not start microphone.");
    }
  };

  const handleSpeakQuestion = async () => {
    if (!currentQuestion?.question) return;
    if (isSpeaking) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    try {
      const res = await fetchWithTimeout("/api/revision/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentQuestion.question })
      }, 60000);
      const data = await res.json();
      if (data.success && data.audioBase64) {
        const audioSrc = `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`;
        const audio = new Audio(audioSrc);
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => {
          fallbackSpeechSynthesis();
        };
        await audio.play();
      } else {
        throw new Error(data.error || "TTS failed");
      }
    } catch (err) {
      fallbackSpeechSynthesis();
    }
  };

  const fallbackSpeechSynthesis = () => {
    if (!window.speechSynthesis) {
      setIsSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentQuestion.question);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  const handleSubmitAnswer = async () => {
    if (!studentAnswer.trim() || !currentQuestion) return;
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    setStep('evaluating');
    try {
      const res = await fetchWithTimeout("/api/revision/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion.question,
          answer: studentAnswer,
          expectedPoints: currentQuestion.expectedPoints || []
        })
      }, 60000);
      const data = await res.json();
      setEvaluation(data);

      const concepts = session?.plan?.concepts || [];
      const currentConcept = concepts[currentConceptIdx];
      setCompletedConcepts(prev => [
        ...prev,
        {
          concept: currentConcept.name,
          question: currentQuestion.question,
          answer: studentAnswer,
          evaluation: data
        }
      ]);

      setStep('session');
    } catch (err) {
      console.error("Evaluation error", err);
      setStep('session');
    }
  };

  const handleNextConcept = () => {
    const concepts = session?.plan?.concepts || [];
    if (currentConceptIdx < concepts.length - 1) {
      const nextIdx = currentConceptIdx + 1;
      setCurrentConceptIdx(nextIdx);
      fetchQuestionForConcept(concepts[nextIdx]);
    } else {
      setStep('completed');
    }
  };

  const handleFinishRevision = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setStep('completed');
  };

  const handleGenerateRevisionNote = async () => {
    if (!session) return;
    setGeneratingNote(true);
    setNoteError(null);
    try {
      const res = await fetchWithTimeout("/api/revision/note/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          materialId: session.materialId,
          materialTitle: session.materialTitle,
          sessionId: session.id,
          conceptsCovered: completedConcepts
        })
      }, 60000);
      const data = await res.json();
      if (!res.ok || !data.success || !data.note) {
        throw new Error(data.error || "Revision Note could not be generated. Please try again.");
      }
      setRevisionNote(data.note);
    } catch (err: any) {
      console.error("Failed to generate revision note:", err);
      setNoteError(err.message || "Revision Note could not be generated. Please try again.");
    } finally {
      setGeneratingNote(false);
    }
  };

  const handleSaveRevisionNote = async () => {
    if (!revisionNote || !session) return;
    setSavingNote(true);
    try {
      await addDoc(collection(db, "notes"), {
        userId,
        title: revisionNote.topic || `${session.materialTitle} - Revision Note`,
        summary: revisionNote.coreIdea || "",
        keyConcepts: revisionNote.keyPoints || [],
        definitions: (revisionNote.mustRemember || []).map((m: string) => ({ term: "Must Remember", definition: m })),
        mechanisms: revisionNote.commonConfusion || [],
        examPoints: revisionNote.examFocus || [],
        memoryCues: (revisionNote.quickSelfCheck || []).map((q: any) => `${q.question} -> ${q.answer}`),
        vivaQuestions: (revisionNote.quickSelfCheck || []).map((q: any) => q.question),
        sourceTitle: session.materialTitle,
        type: "revision",
        revisionData: revisionNote,
        createdAt: new Date().toISOString(),
        isFavorite: true
      });
      setNoteSaved(true);
    } catch (err) {
      console.error("Failed to save revision note to Firestore:", err);
    } finally {
      setSavingNote(false);
    }
  };

  if (step === 'setup') {
    return <SmartRevisionSetup materials={materials} onBack={onBack} onStart={handleStart} />;
  }

  if (step === 'loading') {
    return (
      <div className="max-w-xl mx-auto p-12 text-center space-y-4 font-sans">
        <Loader2 className="animate-spin mx-auto text-sky-500 h-10 w-10" />
        <h2 className="text-base font-bold text-slate-800">Building Your Personal Revision Focus</h2>
        <p className="text-xs text-slate-500">Analyzing your study material and recent activity...</p>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="max-w-xl mx-auto p-6 text-center space-y-4 font-sans">
        <AlertCircle className="mx-auto text-red-500 h-12 w-12" />
        <h2 className="text-xl font-bold text-slate-800">Unable to generate revision plan</h2>
        <p className="text-sm text-slate-500">{errorMessage || "An unexpected error occurred."}</p>
        <div className="flex gap-3 justify-center pt-2">
          <button 
            onClick={() => setStep('setup')} 
            className="px-5 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors"
          >
            Back to Setup
          </button>
        </div>
      </div>
    );
  }

  if (step === 'focus') {
    const concepts = session?.plan?.concepts || [];
    return (
      <div className="max-w-xl mx-auto p-6 space-y-6 font-sans">
        <button onClick={() => setStep('setup')} className="flex items-center gap-1 text-slate-500 font-bold text-xs hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back to Setup
        </button>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-800">Today's Revision Focus</h1>
          <p className="text-xs text-slate-500 font-medium">Here's what Knowva thinks is worth revising right now for <span className="text-slate-800 font-bold">{session?.materialTitle}</span>.</p>
        </div>

        <div className="space-y-3">
          {concepts.map((c: any, i: number) => (
            <div key={i} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-sky-500" />
                  {c.name}
                </h3>
                <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${c.priority === 'high' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
                  {c.priority || 'medium'} priority
                </span>
              </div>
              <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">Why revise this?</span> {c.why}</p>
              <p className="text-xs text-sky-700 bg-sky-50 p-2.5 rounded-xl border border-sky-100 italic">
                <span className="font-semibold not-italic">Quick reminder:</span> {c.quickReminder}
              </p>
            </div>
          ))}
        </div>

        <button 
          onClick={handleContinueToSession} 
          className="w-full py-3.5 bg-sky-600 text-white font-bold text-xs rounded-xl hover:bg-sky-500 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          Start Smart Revision <Sparkles className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (step === 'session' || step === 'evaluating') {
    const concepts = session?.plan?.concepts || [];
    const currentConcept = concepts[currentConceptIdx] || concepts[0];

    return (
      <div className="max-w-xl mx-auto p-6 space-y-6 font-sans">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button onClick={() => setStep('focus')} className="flex items-center gap-1 text-slate-500 font-bold text-xs hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> Back to Focus
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold px-2.5 py-0.5 bg-sky-50 text-sky-600 rounded-full">
              Concept {currentConceptIdx + 1} of {concepts.length}
            </span>
            <button 
              onClick={handleFinishRevision}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 underline"
            >
              Finish Revision
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-800">{session?.materialTitle}</h1>
          <p className="text-xs text-slate-400 font-medium">Let's revise this concept together.</p>
        </div>

        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
          <div className="bg-sky-500 h-full rounded-full transition-all duration-300" style={{ width: `${((currentConceptIdx + 1) / concepts.length) * 100}%` }}></div>
        </div>

        {/* Concept Revision Card */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-sky-600 uppercase tracking-wider">Current Concept</span>
            <h2 className="text-base font-bold text-slate-900">{currentConcept.name}</h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{currentConcept.why}</p>
          <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl space-y-1">
            <span className="text-[10px] font-extrabold text-sky-800 uppercase tracking-wider">Quick reminder</span>
            <p className="text-xs text-sky-900 font-medium">{currentConcept.quickReminder}</p>
          </div>
        </div>

        {/* Revision Question Area */}
        <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
              <HelpCircle className="h-4 w-4 text-sky-600" />
              <span>Check your understanding</span>
            </div>
            {currentQuestion && (
              <button 
                onClick={handleSpeakQuestion}
                title={isSpeaking ? "Stop reading" : "Read question aloud"}
                className={`p-2 rounded-full border transition-colors flex items-center gap-1.5 text-xs font-bold ${isSpeaking ? 'bg-sky-600 text-white border-sky-600 animate-pulse' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
              >
                <Volume2 className="h-4 w-4" />
                <span>{isSpeaking ? "Speaking..." : "Listen"}</span>
              </button>
            )}
          </div>

          {loadingQuestion ? (
            <div className="py-8 text-center space-y-2">
              <Loader2 className="animate-spin h-6 w-6 mx-auto text-sky-500" />
              <p className="text-xs text-slate-400">Preparing question...</p>
            </div>
          ) : currentQuestion ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-800">{currentQuestion.question}</p>

              {!evaluation ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Your answer (Type or Speak)</label>
                      <button
                        onClick={handleMicToggle}
                        type="button"
                        className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${isListening ? 'bg-rose-500 text-white animate-pulse shadow-sm' : 'bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100'}`}
                      >
                        {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                        <span>{isListening ? 'Listening... Click to Stop' : 'Tap to Speak'}</span>
                      </button>
                    </div>

                    {isListening && (
                      <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                        <span>Microphone is active. Speak your answer clearly. Click Stop when finished.</span>
                      </div>
                    )}

                    {speechError && (
                      <p className="text-xs text-amber-600 font-medium">{speechError}</p>
                    )}

                    <textarea 
                      value={studentAnswer} 
                      onChange={e => setStudentAnswer(e.target.value)}
                      placeholder="Type your explanation or tap 'Tap to Speak'..."
                      rows={3}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <button 
                    onClick={handleSubmitAnswer}
                    disabled={!studentAnswer.trim() || step === 'evaluating'}
                    className="w-full py-3.5 bg-sky-600 text-white font-bold text-xs rounded-xl hover:bg-sky-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
                  >
                    {step === 'evaluating' ? <Loader2 className="animate-spin h-4 w-4" /> : 'Submit answer'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 pt-2 border-t border-slate-200">
                  <div className={`p-4 rounded-xl border space-y-2 ${evaluation.status === 'correct' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : evaluation.status === 'partial' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      {evaluation.status === 'correct' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                      <span className="capitalize">Teacher Feedback ({evaluation.status})</span>
                    </div>
                    <p className="text-xs leading-relaxed">{evaluation.feedback}</p>
                    {evaluation.gotRight && (
                      <p className="text-xs"><span className="font-bold">What you got right:</span> {evaluation.gotRight}</p>
                    )}
                    {evaluation.missed && (
                      <p className="text-xs"><span className="font-bold">Important point missed:</span> {evaluation.missed}</p>
                    )}
                  </div>

                  {evaluation.takeaway && (
                    <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Remember this</span>
                      <p className="text-xs font-semibold text-slate-800">{evaluation.takeaway}</p>
                    </div>
                  )}

                  <button 
                    onClick={handleNextConcept}
                    className="w-full py-3 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    {currentConceptIdx < concepts.length - 1 ? 'Next concept' : 'Finish revision'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-4">Could not load question.</p>
          )}
        </div>
      </div>
    );
  }

  if (step === 'completed') {
    const concepts = session?.plan?.concepts || [];
    return (
      <div className="max-w-xl mx-auto p-6 space-y-6 font-sans">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Revision Complete</h1>
          <p className="text-xs text-slate-500">Great job working through your study material today.</p>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
          <div className="flex justify-between items-center text-xs font-bold text-slate-700 border-b border-slate-100 pb-2">
            <span>Concepts Covered</span>
            <span className="text-sky-600">{completedConcepts.length} of {concepts.length}</span>
          </div>

          <div className="space-y-2">
            {completedConcepts.map((item, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>{item.concept}</span>
                  <span className={`text-[9px] uppercase px-2 py-0.5 rounded-full ${item.evaluation?.status === 'correct' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {item.evaluation?.status || 'reviewed'}
                  </span>
                </div>
                <p className="text-slate-500 italic">"{item.question}"</p>
              </div>
            ))}
          </div>
        </div>

        {/* Revision Note Section */}
        {!revisionNote ? (
          <div className="p-5 bg-sky-50 border border-sky-100 rounded-2xl space-y-3 text-center">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5">
                <FileText className="h-4 w-4 text-sky-600" />
                <span>Create Exam Revision Note</span>
              </h3>
              <p className="text-xs text-slate-600">Generate a high-yield summary note based on this revision session for quick last-minute exam prep.</p>
            </div>
            <button
              onClick={handleGenerateRevisionNote}
              disabled={generatingNote}
              className="px-5 py-3 bg-sky-600 text-white font-bold text-xs rounded-xl hover:bg-sky-500 transition-colors flex items-center justify-center gap-2 mx-auto shadow-sm disabled:opacity-50"
            >
              {generatingNote ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />
                  <span>Generating Revision Note...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Create Revision Note</span>
                </>
              )}
            </button>
            {noteError && (
              <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-100 p-2.5 rounded-xl">{noteError}</p>
            )}
          </div>
        ) : (
          <div className="p-5 bg-white border border-sky-200 rounded-2xl shadow-sm space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-extrabold text-sky-600 uppercase tracking-wider">Exam Revision Note</span>
                <h3 className="text-base font-bold text-slate-900">{revisionNote.topic}</h3>
              </div>
              <button
                onClick={handleSaveRevisionNote}
                disabled={savingNote || noteSaved}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${noteSaved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
              >
                {savingNote ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : noteSaved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                <span>{noteSaved ? 'Saved to Notes Library' : 'Save Note'}</span>
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="space-y-1">
                <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wider text-sky-700">Core Idea</span>
                <p className="bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">{revisionNote.coreIdea}</p>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wider text-sky-700">Key Points</span>
                <ul className="list-disc list-inside space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {revisionNote.keyPoints?.map((pt: string, idx: number) => (
                    <li key={idx} className="leading-relaxed">{pt}</li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1 bg-amber-50/60 p-3 rounded-xl border border-amber-100">
                  <span className="font-bold text-amber-800 uppercase text-[10px] tracking-wider">Must Remember</span>
                  <ul className="list-disc list-inside space-y-1 text-amber-900">
                    {revisionNote.mustRemember?.map((m: string, idx: number) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1 bg-rose-50/60 p-3 rounded-xl border border-rose-100">
                  <span className="font-bold text-rose-800 uppercase text-[10px] tracking-wider">Common Confusion</span>
                  <ul className="list-disc list-inside space-y-1 text-rose-900">
                    {revisionNote.commonConfusion?.map((c: string, idx: number) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-1 bg-sky-50/60 p-3 rounded-xl border border-sky-100">
                <span className="font-bold text-sky-800 uppercase text-[10px] tracking-wider">Exam Focus</span>
                <ul className="list-disc list-inside space-y-1 text-sky-900">
                  {revisionNote.examFocus?.map((e: string, idx: number) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wider text-sky-700">Quick Self-Check (3 Questions)</span>
                <div className="space-y-2">
                  {revisionNote.quickSelfCheck?.map((qc: any, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                      <p className="font-bold text-slate-800">Q{idx + 1}: {qc.question}</p>
                      <p className="text-slate-600 font-medium">Answer: {qc.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <button 
          onClick={() => setStep('setup')}
          className="w-full py-3.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
        >
          Start Another Revision Session
        </button>
      </div>
    );
  }

  return null;
}
