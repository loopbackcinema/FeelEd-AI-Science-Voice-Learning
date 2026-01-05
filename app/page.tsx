'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CURRICULUM, FALLBACK_ERROR_MSG } from '../constants';
import { AppStep, ClassLevel, Topic, LearningSession } from '../types';
import { generateScienceContent, generateSimplerExplanation } from '../services/geminiService';
import { speechToText, textToSpeech } from '../services/sarvamService';
import { logSession } from '../services/supabaseService';

// Icons
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/center" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 1.5a3 3 0 00-3 3v4.5a3 3 0 006 0v-4.5a3 3 0 00-3-3z" />
  </svg>
);
const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-12 h-12 text-white">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
  </svg>
);
const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);
const MagicWand = () => <span className="text-4xl animate-bounce">🪄</span>;

export default function Home() {
  const [step, setStep] = useState<AppStep>('CLASS_SELECT');
  const [session, setSession] = useState<LearningSession>({
    classLevel: null,
    topic: null,
    userQuery: '',
    explanationText: '',
    explanationAudioUrl: null,
    quiz: [],
    score: 0,
    actionTaken: null,
  });
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('சிந்திக்கிறது...');
  const [isPlaying, setIsPlaying] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const resetApp = () => {
     setStep('CLASS_SELECT');
     setSession({
        classLevel: null,
        topic: null,
        userQuery: '',
        explanationText: '',
        explanationAudioUrl: null,
        quiz: [],
        score: 0,
        actionTaken: null,
     });
     setTextInput('');
     setAudioError(null);
  };

  const handleClassSelect = (cls: ClassLevel) => {
    setSession(prev => ({ ...prev, classLevel: cls }));
    setStep('TOPIC_SELECT');
  };

  const handleTopicSelect = (topic: Topic) => {
    setSession(prev => ({ ...prev, topic: topic }));
    setStep('INPUT');
  };

  const handleQuizAnswer = (questionIndex: number, optionIndex: number) => {
    const newAnswers = [...quizAnswers];
    newAnswers[questionIndex] = optionIndex;
    setQuizAnswers(newAnswers);
  };

  const getSupportedMimeType = () => {
    const types = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/wav'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Wrap recording logic in a small delay to ensure final chunks are processed
        setTimeout(async () => {
          if (audioChunksRef.current.length === 0) {
            alert("No audio captured. Please try again.");
            setStep('INPUT');
            return;
          }
          setIsProcessing(true);
          setLoadingMessage('கேட்கிறது (Listening)...');
          setStep('PROCESSING');
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
          try {
            const transcript = await speechToText(audioBlob);
            if (!transcript.trim()) throw new Error("No transcript returned");
            setSession(prev => ({ ...prev, userQuery: transcript }));
            await processContentGeneration(transcript);
          } catch (error) {
            alert("அறிவியல் இயந்திரம் கேட்கவில்லை. மீண்டும் பேசவும்.");
            setStep('INPUT');
          } finally {
            setIsProcessing(false);
          }
        }, 300);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      alert("மைக்ரோஃபோன் அனுமதி தேவை.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    setSession(prev => ({...prev, userQuery: textInput}));
    setStep('PROCESSING');
    processContentGeneration(textInput);
  };

  const processContentGeneration = async (query: string, isSimplification: boolean = false) => {
    try {
      setLoadingMessage('கதை எழுதுகிறது (Creating Story)...');
      let storyText = "";
      if (isSimplification && session.explanationText) {
        storyText = await generateSimplerExplanation(session.explanationText);
        setSession(prev => ({ ...prev, explanationText: storyText }));
      } else {
        const content = await generateScienceContent(session.classLevel!, session.topic!.en, query);
        storyText = content.story;
        setSession(prev => ({ ...prev, explanationText: content.story, quiz: content.quiz }));
      }
      setLoadingMessage('ஒலி உருவாக்கப்படுகிறது (Generating Voice)...');
      const audioUrl = await textToSpeech(storyText);
      setSession(prev => ({ ...prev, explanationAudioUrl: audioUrl }));
      setStep('PLAYBACK');
    } catch (e) {
      setStep('INPUT');
    }
  };

  const handleAction = async (action: 'understood' | 'explain_again' | 'replay') => {
    setSession(prev => ({ ...prev, actionTaken: action }));
    if (action === 'replay') {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current.play();
      }
    } else if (action === 'explain_again') {
      setIsProcessing(true);
      setLoadingMessage('மீண்டும் சிந்திக்கிறது...');
      setStep('PROCESSING');
      await processContentGeneration(session.userQuery, true);
      setIsProcessing(false);
    } else {
      setStep('QUIZ');
      setQuizAnswers(new Array(session.quiz.length).fill(-1));
    }
  };

  const submitQuiz = async () => {
    let correctCount = 0;
    session.quiz.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correctIndex) correctCount++;
    });
    setSession(prev => ({ ...prev, score: correctCount }));
    setStep('RESULT');
    
    // Crucial: Log to Supabase
    logSession({
      class_level: session.classLevel!,
      topic: session.topic!.en,
      question: session.userQuery,
      action: session.actionTaken || 'unknown',
      quiz_score: correctCount
    });

    try {
      const fb = await textToSpeech(correctCount > 0 ? "வாழ்த்துகள்!" : "பரவாயில்லை!");
      new Audio(fb).play();
    } catch(e) {}
  };

  const HeaderNav = () => (
    <div className="fixed top-0 left-0 right-0 w-full flex items-center justify-between p-4 bg-white/95 backdrop-blur-md z-50 border-b border-indigo-100 shadow-sm transition-all duration-300">
      <div className="flex items-center gap-2 cursor-pointer" onClick={resetApp}>
        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-2 rounded-xl shadow-lg">
          <span className="text-white text-xl">🪄</span>
        </div>
        <h1 className="text-2xl font-black text-indigo-900 tracking-tight">FeelEd AI</h1>
      </div>
      {step !== 'CLASS_SELECT' && (
        <button onClick={resetApp} className="bg-indigo-50 text-indigo-700 px-5 py-2 rounded-full text-sm font-black font-tamil border-2 border-indigo-100 hover:bg-indigo-100 transition active:scale-95">
          Home (முகப்பு)
        </button>
      )}
    </div>
  );

  const renderClassSelection = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 animate-fade-in text-center relative">
      <div className="mb-10 scale-125">
         <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 mb-2 drop-shadow-2xl">FeelEd AI</h1>
         <h2 className="text-4xl font-black text-indigo-900 tracking-tighter mt-4">Magic Story Engine</h2>
      </div>

      <div className="bg-white/40 backdrop-blur-md p-8 rounded-[3rem] border-4 border-white shadow-2xl mb-12 w-full max-w-xl">
        <p className="font-tamil text-3xl text-indigo-900 font-black mb-4 leading-tight">அறிவியல் குரல் வழி கதைகள் கேட்கலாம் வாங்க!</p>
        <p className="text-indigo-600 font-black italic text-xl tracking-wide opacity-80">Hard topics turn into magic stories</p>
      </div>

      <div className="grid grid-cols-1 gap-6 w-full max-w-sm">
        {['6', '7', '8'].map((cls) => (
          <button key={cls} onClick={() => handleClassSelect(cls as ClassLevel)} className="group relative bg-white border-4 border-indigo-50 rounded-[2.5rem] p-8 text-4xl font-black shadow-2xl hover:border-indigo-400 hover:bg-indigo-50 transition-all transform hover:scale-105 active:scale-95 flex justify-between items-center overflow-hidden">
            <span className="relative z-10 text-indigo-900">Class {cls}</span>
            <span className="font-tamil relative z-10 text-indigo-600">{cls} ஆம் வகுப்பு</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderTopicSelection = () => (
    <div className="p-4 animate-fade-in max-w-lg mx-auto py-10">
      <h2 className="text-center text-4xl font-black text-indigo-900 font-tamil mb-10">தலைப்பைத் தேர்ந்தெடுக்கவும்</h2>
      <div className="space-y-4">
        {CURRICULUM[session.classLevel!].map((t) => (
          <button key={t.id} onClick={() => handleTopicSelect(t)} className="w-full bg-white border-b-8 border-indigo-100 rounded-[2.5rem] p-8 shadow-xl hover:shadow-2xl transition transform hover:-translate-y-1 active:scale-95 flex items-center gap-6">
            <div className="text-5xl bg-indigo-50 p-4 rounded-3xl shadow-inner">📘</div>
            <div>
               <div className="font-black text-2xl text-indigo-900 leading-tight">{t.en}</div>
               <div className="font-tamil text-indigo-500 text-2xl font-bold mt-1">{t.ta}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderInput = () => (
    <div className="flex flex-col items-center justify-center min-h-[75vh] p-6 animate-fade-in">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-black text-indigo-900 font-tamil mb-2">கேள்வி கேளுங்கள்</h2>
        <p className="text-indigo-400 font-bold tracking-widest uppercase">The magic engine is listening</p>
      </div>
      <button onClick={isRecording ? stopRecording : startRecording} disabled={isProcessing} className={`w-48 h-48 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all border-[10px] relative ${isRecording ? 'bg-red-500 border-red-200 text-white animate-pulse' : 'bg-gradient-to-br from-indigo-600 to-purple-600 border-white text-white active:scale-90'}`}>
        {isRecording ? <StopIcon /> : <MicIcon />}
        <span className="mt-2 text-xs font-black tracking-widest">{isRecording ? "Stop" : "Speak"}</span>
      </button>
      <p className="mt-10 text-indigo-900 text-center font-tamil font-black text-3xl">{isRecording ? "நாங்கள் கேட்கிறோம்..." : "பேச தட்டவும்"}</p>
      <div className="mt-20 w-full max-w-lg">
          <div className="flex gap-2 bg-white p-3 rounded-[2.5rem] shadow-2xl border-4 border-indigo-50">
            <input type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="இங்கே தட்டச்சு செய்யவும்..." className="flex-1 p-5 rounded-3xl bg-transparent focus:outline-none font-tamil text-xl font-bold text-indigo-900" onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()} />
            <button onClick={handleTextSubmit} className="bg-indigo-600 text-white px-8 py-4 rounded-[2rem] shadow-lg active:scale-95 transition flex items-center gap-3">
              <span className="font-tamil font-black text-lg">அனுப்பு</span>
              <SendIcon />
            </button>
          </div>
      </div>
    </div>
  );

  const renderProcessing = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-12 text-center animate-fade-in">
        <div className="relative mb-16">
          <div className="w-40 h-40 border-[16px] border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center"><MagicWand /></div>
        </div>
        <p className="font-tamil text-4xl font-black text-indigo-900 mb-6">{loadingMessage}</p>
        <p className="text-indigo-400 font-black uppercase tracking-[0.3em] animate-pulse">Turning curiosity into magic...</p>
    </div>
  );

  const renderPlayback = () => (
    <div className="flex flex-col p-4 animate-fade-in max-w-2xl mx-auto pb-8">
      <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden mb-10 border-b-[16px] border-indigo-100/50">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white text-center">
          <p className="font-tamil text-3xl font-black drop-shadow-sm">{session.userQuery}</p>
        </div>
        <div className="p-10"><p className="font-tamil text-2xl leading-relaxed text-indigo-900 font-bold whitespace-pre-wrap">{session.explanationText}</p></div>
      </div>
      <div className="w-full mb-12 sticky bottom-32 z-20">
        {session.explanationAudioUrl && (
          <div className="bg-white/95 backdrop-blur-sm p-6 rounded-[2.5rem] shadow-2xl border-4 border-indigo-50">
            <audio ref={audioPlayerRef} src={session.explanationAudioUrl} controls autoPlay className="w-full h-12" onEnded={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-5">
        <button onClick={() => handleAction('understood')} className="w-full bg-green-500 text-white p-8 rounded-[2rem] text-3xl font-black font-tamil shadow-xl hover:bg-green-600 active:scale-95 flex items-center justify-center gap-5">ஆம், புரிந்தது! 🎮</button>
        <div className="grid grid-cols-2 gap-5">
            <button onClick={() => handleAction('explain_again')} className="bg-white text-indigo-600 p-8 rounded-[2rem] font-black font-tamil text-xl shadow-xl border-4 border-indigo-50 active:scale-95">மீண்டும் விளக்கவும்</button>
            <button onClick={() => handleAction('replay')} className="bg-indigo-100 text-indigo-700 p-8 rounded-[2rem] font-black font-tamil text-xl shadow-xl border-4 border-indigo-200 active:scale-95 flex items-center justify-center gap-3">மீண்டும் கேட்க</button>
        </div>
      </div>
    </div>
  );

  const renderQuiz = () => (
    <div className="p-4 max-w-2xl mx-auto animate-fade-in py-10 pb-8">
        <h2 className="text-5xl font-black font-tamil text-center text-indigo-900 mb-10">மினி வினாடி வினா</h2>
        <div className="space-y-10">
            {session.quiz.map((q, qIdx) => (
                <div key={q.id} className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-indigo-50 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-3 h-full bg-indigo-600"/>
                    <p className="font-tamil font-black text-2xl mb-8 text-indigo-900">{qIdx + 1}. {q.question}</p>
                    <div className="space-y-4">
                        {q.options.map((opt, oIdx) => (
                            <button key={oIdx} onClick={() => handleQuizAnswer(qIdx, oIdx)} className={`w-full text-left p-6 rounded-3xl font-tamil font-black text-2xl transition border-4 ${quizAnswers[qIdx] === oIdx ? 'bg-indigo-600 border-indigo-300 text-white shadow-xl' : 'bg-indigo-50 border-transparent text-indigo-900'}`}>{opt}</button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
        <button disabled={quizAnswers.includes(-1)} onClick={submitQuiz} className="w-full mt-16 bg-indigo-600 disabled:bg-indigo-200 text-white p-10 rounded-[3rem] text-3xl font-black font-tamil shadow-2xl active:scale-95 transition">முடிவுகளை காட்டு</button>
    </div>
  );

  const renderResult = () => (
    <div className="flex flex-col items-center justify-center min-h-[85vh] p-6 text-center animate-fade-in">
        <div className="text-[12rem] mb-10 drop-shadow-2xl animate-bounce">{session.score === session.quiz.length ? '🏆' : '✨'}</div>
        <h2 className="text-6xl font-black font-tamil mb-6 text-indigo-900">{session.score === session.quiz.length ? 'அற்புதம்!' : 'நன்று!'}</h2>
        <div className="bg-white px-16 py-10 rounded-[4rem] shadow-2xl border-[12px] border-indigo-50 mb-16">
            <p className="text-9xl font-black text-indigo-600">{session.score}<span className="text-4xl text-indigo-200"> / {session.quiz.length}</span></p>
        </div>
        <button onClick={resetApp} className="bg-indigo-600 text-white px-16 py-8 rounded-full text-4xl font-black font-tamil shadow-2xl hover:scale-110 transition active:scale-95">முகப்பு பக்கம்</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFF] font-sans overflow-x-hidden selection:bg-indigo-100">
      {/* Dynamic Background elements */}
      <div className="fixed inset-0 pointer-events-none opacity-20 overflow-hidden z-0">
        <div className="absolute top-20 left-10 text-6xl animate-pulse">✨</div>
        <div className="absolute bottom-60 right-20 text-5xl animate-bounce">🪄</div>
        <div className="absolute top-1/2 right-10 text-7xl opacity-40">⭐</div>
        <div className="absolute bottom-10 left-1/4 text-5xl animate-pulse delay-700">💫</div>
      </div>

      <HeaderNav />
      <div className="max-w-4xl mx-auto relative z-10 pt-28 pb-24">
        {step === 'CLASS_SELECT' && renderClassSelection()}
        {step === 'TOPIC_SELECT' && renderTopicSelection()}
        {step === 'INPUT' && renderInput()}
        {step === 'PROCESSING' && renderProcessing()}
        {step === 'PLAYBACK' && renderPlayback()}
        {step === 'QUIZ' && renderQuiz()}
        {step === 'RESULT' && renderResult()}
      </div>
      {/* Universal Copyright Footer */}
      <div className="fixed bottom-0 left-0 w-full p-2 bg-slate-50/90 backdrop-blur border-t border-slate-200 text-[10px] flex flex-col items-center justify-center z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <span className="font-bold text-indigo-400 uppercase tracking-widest mb-0.5">Powered by SARVAM</span>
        <span className="font-semibold text-indigo-300 flex items-center gap-1 uppercase tracking-wider">
            <span>&copy;</span> All rights reserved FeelEd AI 2026
        </span>
      </div>
    </div>
  );
}