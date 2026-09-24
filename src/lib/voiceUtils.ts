import { useState, useRef, useEffect } from 'react';

export const useVoiceInteractions = (
    onTranscriptUpdate: (text: string) => void,
    onSpeechEnd: () => void,
    selectedVoice: SpeechSynthesisVoice | null
) => {
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [speechError, setSpeechError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);

    const speak = (text: string, onEnd?: () => void) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => { setIsSpeaking(false); if (onEnd) onEnd(); };
        utterance.lang = 'en-US';
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
    };

    const toggleMic = async () => {
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) return;

        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        try {
            const recognition = new SpeechRecognitionAPI();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';
            let finalTranscript = '';

            recognition.onstart = () => setIsListening(true);
            recognition.onresult = (event: any) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
                    else interim += event.results[i][0].transcript;
                }
                onTranscriptUpdate(finalTranscript + interim);
            };
            recognition.onerror = () => setIsListening(false);
            recognition.onend = () => setIsListening(false);

            recognitionRef.current = recognition;
            recognition.start();
        } catch (err) {
            setSpeechError("Failed to initialize microphone.");
            setIsListening(false);
        }
    };

    return { isListening, isSpeaking, speak, toggleMic, speechError };
};
