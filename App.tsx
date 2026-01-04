import React, { useState, useEffect, useRef } from 'react';
import { CURRICULUM, FALLBACK_ERROR_MSG } from './constants';
import { AppStep, ClassLevel, Topic, LearningSession } from './types';
import { generateScienceContent, generateSimplerExplanation } from './services/geminiService';
import { speechToText, textToSpeech } from './services/sarvamService';
import { logSession } from './services/supabaseService';

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

const App: React.FC = () => {
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

  // Improved Voice Input Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
          options.mimeType = 'audio/ogg';
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        setLoadingMessage('கேட்கிறது (Listening)...');
        setStep('PROCESSING');
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        
        try {
          const transcript = await speechToText(audioBlob);
          if (!transcript.trim()) throw new Error("No speech detected");
          setSession(prev => ({ ...prev, userQuery: transcript }));
          await processContentGeneration(transcript);
        } catch (error: any) {
          console.error(error);
          alert("மன்னிக்கவும், மீண்டும் பேசவும் (Try speaking again).");
          setStep('INPUT');
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing mic:", err);
      alert("Microphone access is needed. / மைக்ரோஃபோன் அனுமதி தேவை.");
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
      try {
        const audioUrl = await textToSpeech(storyText);
        setSession(prev => ({ ...prev, explanationAudioUrl: audioUrl }));
      } catch (audioError: any) {
         setAudioError(audioError.message || "Unknown Audio Error");
      }

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

  const handleQuizAnswer = (questionIndex: number, optionIndex: number) => {
    const newAnswers = [...quizAnswers];
    newAnswers[questionIndex] = optionIndex;
    setQuizAnswers(newAnswers);
  };

  const submitQuiz = async () => {
    let correctCount = 0;
    session.quiz.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correctIndex) correctCount++;
    });

    setSession(prev => ({ ...prev, score: correctCount }));
    setStep('RESULT');

    await logSession({
      class_level: session.classLevel!,
      topic: session.topic!.en,
      question: session.userQuery,
      action: session.actionTaken || 'unknown',
      quiz_score: correctCount
    });

    try {
      const fbText = correctCount > 0 ? "வாழ்த்துகள்!" : "பரவாயில்லை!";
      const feedbackAudio = await textToSpeech(fbText);
      const audio = new Audio(feedbackAudio);
      audio.play();
    } catch(e) {}
  };

  // --- UI Components ---

  const HeaderNav = () => (
    <div className="w-full flex items-center justify-between p-4 bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-indigo-100">
      <div className="flex items-center gap-2 cursor-pointer" onClick={resetApp}>
        <div className="bg-indigo-600 p-2 rounded-xl shadow-lg">
          <span className="text-white text-xl">🪄</span>
        </div>
        <h1 className="text-2xl font-black text-indigo-900 tracking-tight">FeelEd AI</h1>
      </div>
      {step !== 'CLASS_SELECT' && (
        <button 
          onClick={resetApp}
          className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full text-sm font-bold font-tamil border border-indigo-200 hover:bg-indigo-100 transition active:scale-95"
        >
          Back to Story Engine (முகப்பு)
        </button>
      )}
    </div>
  );

  const renderClassSelection = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 animate-fade-in text-center">
      <div className="mb-8 scale-110">
         <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 mb-2 drop-shadow-sm">FeelEd AI</h1>
         <h2 className="text-2xl font-bold text-indigo-400 uppercase tracking-widest">Magic Story Engine</h2>
      </div>

      <div className="bg-white/40 backdrop-blur-sm p-6 rounded-[2rem] border-2 border-white shadow-xl mb-10 w-full max-w-md">
        <p className="font-tamil text-2xl text-indigo-900 font-bold mb-2">அறிவியல் குரல் வழி கதைகள் கேட்கலாம் வாங்க!</p>
        <p className="text-indigo-500 font-bold italic tracking-tight">Hard topics turn into magic stories</p>
      </div>

      <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
        {['6', '7', '8'].map((cls) => (
          <button
            key={cls}
            onClick={() => handleClassSelect(cls as ClassLevel)}
            className="group relative bg-white border-2 border-indigo-200 rounded-3xl p-6 text-3xl font-black shadow-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all transform hover:scale-105 active:scale-95 flex justify-between items-center overflow-hidden"
          >
            <span className="relative z-10 text-indigo-900">Class {cls}</span>
            <span className="font-tamil relative z-10 text-indigo-600">{cls} ஆம் வகுப்பு</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderTopicSelection = () => (
    <div className="p-4 animate-fade-in max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-black text-indigo-900 font-tamil">தலைப்பைத் தேர்ந்தெடுக்கவும்</h2>
        <p className="text-indigo-400 font-bold">Select a Magic Topic</p>
      </div>
      <div className="space-y-4">
        {CURRICULUM[session.classLevel!].map((t) => (
          <button
            key={t.id}
            onClick={() => handleTopicSelect(t)}
            className="w-full bg-white border-b-8 border-indigo-100 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-indigo-300 text-left transition transform hover:-translate-y-1 active:scale-95 flex items-center gap-4"
          >
            <div className="text-4xl bg-indigo-50 p-3 rounded-2xl">📘</div>
            <div>
               <div className="font-black text-xl text-indigo-900 leading-tight">{t.en}</div>
               <div className="font-tamil text-indigo-500 text-xl font-bold">{t.ta}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderInput = () => (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 animate-fade-in">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-black text-indigo-900 font-tamil mb-2">கேள்வி கேளுங்கள்</h2>
        <p className="text-indigo-400 font-bold">Speak or Type your magic question</p>
      </div>

      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        className={`w-40 h-40 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all border-8 relative group ${
          isRecording 
          ? 'bg-red-500 border-red-200 text-white animate-pulse' 
          : 'bg-indigo-600 border-indigo-200 text-white hover:bg-indigo-700 active:scale-90'
        }`}
      >
        {isRecording ? <StopIcon /> : <MicIcon />}
        <span className="mt-2 text-xs font-black uppercase tracking-widest">{isRecording ? "Stop" : "Speak"}</span>
        {!isRecording && <div className="absolute -inset-4 border-2 border-indigo-400 rounded-full animate-ping opacity-20"/>}
      </button>
      
      <p className="mt-8 text-indigo-900 text-center font-tamil font-black text-2xl">
        {isRecording ? "நாங்கள் கேட்கிறோம்..." : "பேச தட்டவும்"}
      </p>

      <div className="mt-16 w-full max-w-md">
          <div className="flex gap-2 bg-white p-2 rounded-[2rem] shadow-xl border-2 border-indigo-100">
            <input 
                type="text" 
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="கேள்வியைத் தட்டச்சு செய்க..." 
                className="flex-1 p-4 rounded-3xl bg-transparent focus:outline-none font-tamil text-lg font-bold"
                onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
            />
            <button 
              onClick={handleTextSubmit}
              className="bg-indigo-600 text-white p-4 rounded-[1.5rem] shadow-lg active:scale-95 transition flex items-center gap-2"
            >
              <span className="font-tamil font-bold hidden sm:block">அனுப்பு</span>
              <SendIcon />
            </button>
          </div>
          <p className="text-center mt-4 text-xs text-indigo-300 font-black uppercase tracking-widest">Type and press Send / அனுப்பு</p>
      </div>
    </div>
  );

  const renderProcessing = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-12 text-center animate-fade-in">
        <div className="relative mb-12">
          <div className="w-32 h-32 border-[12px] border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <MagicWand />
          </div>
        </div>
        <p className="font-tamil text-3xl font-black text-indigo-900 mb-4">{loadingMessage}</p>
        <p className="text-indigo-400 font-bold uppercase tracking-widest animate-pulse">Turning science into magic...</p>
    </div>
  );

  const renderPlayback = () => (
    <div className="flex flex-col p-4 animate-fade-in max-w-xl mx-auto pb-32">
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden mb-8 border-b-[12px] border-indigo-100">
        <div className="bg-indigo-600 p-6 text-white text-center">
          <h3 className="text-xs font-black opacity-80 uppercase tracking-widest mb-1">Your Magic Story:</h3>
          <p className="font-tamil text-2xl font-bold leading-tight">{session.userQuery}</p>
        </div>
        <div className="p-8 bg-gradient-to-b from-white to-indigo-50/30">
          <p className="font-tamil text-2xl leading-relaxed text-indigo-900 font-medium whitespace-pre-wrap">{session.explanationText}</p>
        </div>
      </div>

      <div className="w-full mb-10 sticky bottom-28 z-20">
        {session.explanationAudioUrl ? (
          <div className="bg-white p-5 rounded-full shadow-2xl border-4 border-indigo-100 flex items-center">
            <audio 
                ref={audioPlayerRef} 
                src={session.explanationAudioUrl} 
                controls 
                autoPlay
                className="w-full h-12"
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
            />
          </div>
        ) : (
          <div className="p-4 bg-red-50 text-red-600 rounded-3xl text-center font-tamil border-2 border-red-100 font-bold">
             ஒலி கிடைக்கவில்லை (Audio Error)
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <button onClick={() => handleAction('understood')} className="w-full bg-green-500 text-white p-6 rounded-3xl text-2xl font-black font-tamil shadow-xl hover:bg-green-600 transition active:scale-95 flex items-center justify-center gap-4">
          புரிந்தது, விளையாடுவோம்! <span>🎮</span>
        </button>
        
        <div className="grid grid-cols-2 gap-4">
            <button onClick={() => handleAction('explain_again')} className="bg-white text-indigo-600 p-6 rounded-3xl font-black font-tamil shadow border-2 border-indigo-50 hover:bg-indigo-50 transition active:scale-95">
             மீண்டும் விளக்கவும்
            </button>
            <button onClick={() => handleAction('replay')} className="bg-indigo-100 text-indigo-700 p-6 rounded-3xl font-black font-tamil shadow border-2 border-indigo-200 hover:bg-indigo-200 transition active:scale-95 flex items-center justify-center gap-2">
             மீண்டும் கேட்க {isPlaying && <span className="w-3 h-3 bg-indigo-500 rounded-full animate-ping"/>}
            </button>
        </div>
      </div>
    </div>
  );

  const renderQuiz = () => (
    <div className="p-4 max-w-xl mx-auto animate-fade-in pb-32">
        <div className="text-center mb-10">
           <h2 className="text-4xl font-black font-tamil text-indigo-900 mb-2">மினி வினாடி வினா</h2>
           <p className="text-indigo-400 font-bold tracking-widest uppercase text-sm">Unlock your magic power!</p>
        </div>

        <div className="space-y-8">
            {session.quiz.map((q, qIdx) => (
                <div key={q.id} className="bg-white p-8 rounded-[2rem] shadow-xl border-2 border-indigo-50 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"/>
                    <p className="font-tamil font-black text-2xl mb-6 text-indigo-900 leading-tight">{qIdx + 1}. {q.question}</p>
                    <div className="space-y-3">
                        {q.options.map((opt, oIdx) => (
                            <button
                                key={oIdx}
                                onClick={() => handleQuizAnswer(qIdx, oIdx)}
                                className={`w-full text-left p-5 rounded-2xl font-tamil font-bold text-xl transition-all border-4 ${
                                    quizAnswers[qIdx] === oIdx 
                                    ? 'bg-indigo-600 border-indigo-300 text-white shadow-lg scale-[1.02]' 
                                    : 'bg-indigo-50 border-transparent text-indigo-900 hover:bg-indigo-100'
                                }`}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>

        <button 
            disabled={quizAnswers.includes(-1)}
            onClick={submitQuiz}
            className="w-full mt-12 bg-indigo-600 disabled:bg-indigo-200 text-white p-8 rounded-[2rem] text-2xl font-black font-tamil shadow-2xl transform active:scale-95 transition"
        >
            முடிவுகளை காட்டு (Check Results)
        </button>
    </div>
  );

  const renderResult = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center animate-fade-in">
        <div className="text-9xl mb-8 transform hover:rotate-12 transition-transform drop-shadow-2xl">
            {session.score === session.quiz.length ? '🏆' : session.score > 0 ? '✨' : '📚'}
        </div>
        <h2 className="text-5xl font-black font-tamil mb-4 text-indigo-900">
            {session.score === session.quiz.length ? 'அற்புதம்!' : 'நன்று!'}
        </h2>
        <div className="bg-white px-12 py-8 rounded-[3rem] shadow-2xl border-8 border-indigo-100 mb-12">
            <p className="text-7xl font-black text-indigo-600">
                {session.score} / {session.quiz.length}
            </p>
            <p className="text-sm font-black text-indigo-300 mt-4 uppercase tracking-[0.3em]">Magic Score</p>
        </div>

        <button 
            onClick={resetApp}
            className="bg-indigo-600 text-white px-12 py-6 rounded-full text-3xl font-black font-tamil shadow-2xl hover:bg-indigo-700 transition transform hover:scale-110 active:scale-95"
        >
            முகப்பு பக்கம் (Home)
        </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFDFF] font-sans pb-20 overflow-x-hidden selection:bg-indigo-100">
      {/* Decorative background sparkles */}
      <div className="fixed inset-0 pointer-events-none opacity-20 overflow-hidden">
        <div className="absolute top-20 left-10 text-4xl animate-pulse">✨</div>
        <div className="absolute bottom-40 right-20 text-3xl animate-bounce">🪄</div>
        <div className="absolute top-1/2 right-10 text-5xl opacity-40">⭐</div>
      </div>

      <HeaderNav />
      <div className="max-w-4xl mx-auto relative z-10">
        {step === 'CLASS_SELECT' && renderClassSelection()}
        {step === 'TOPIC_SELECT' && renderTopicSelection()}
        {step === 'INPUT' && renderInput()}
        {step === 'PROCESSING' && renderProcessing()}
        {step === 'PLAYBACK' && renderPlayback()}
        {step === 'QUIZ' && renderQuiz()}
        {step === 'RESULT' && renderResult()}
      </div>
      
      {/* Footer */}
      <div className="fixed bottom-0 left-0 w-full p-3 bg-white/50 backdrop-blur-sm text-[10px] flex justify-center gap-6 text-indigo-300 font-black z-50">
        <span className="tracking-widest">FEEL-ED MAGIC ENGINE v2.0</span>
        <span className="tracking-widest">TAMIL SCIENCE PILOT</span>
      </div>
    </div>
  );
};

export default App;