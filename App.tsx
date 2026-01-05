import React, { useState, useEffect, useRef } from 'react';
import { CURRICULUM, FALLBACK_ERROR_MSG } from './constants';
import { AppStep, ClassLevel, Topic, LearningSession } from './types';
import { generateScienceContent, generateSimplerExplanation } from './services/geminiService';
import { speechToText, textToSpeech } from './services/sarvamService';
import { logSession } from './services/supabaseService';

// Icons (SVG)
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 1.5a3 3 0 00-3 3v4.5a3 3 0 006 0v-4.5a3 3 0 00-3-3z" />
  </svg>
);
const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
  </svg>
);

const App: React.FC = () => {
  // State
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
  const [loadingMessage, setLoadingMessage] = useState('Thinking... (சிந்திக்கிறது...)');
  const [isPlaying, setIsPlaying] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // --- Handlers ---

  const handleClassSelect = (cls: ClassLevel) => {
    setSession(prev => ({ ...prev, classLevel: cls }));
    setStep('TOPIC_SELECT');
  };

  const handleTopicSelect = (topic: Topic) => {
    setSession(prev => ({ ...prev, topic: topic }));
    setStep('INPUT');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = handleRecordingStop;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing mic:", err);
      alert("Microphone access is needed for this feature. / மைக்ரோஃபோன் அனுமதி தேவை.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleRecordingStop = async () => {
    setIsProcessing(true);
    setLoadingMessage('Listening... (கேட்கிறது...)');
    setStep('PROCESSING');
    setAudioError(null);
    
    // Tiny delay to ensure last chunk is pushed
    await new Promise(resolve => setTimeout(resolve, 100));

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
    
    try {
      // 1. ASR
      const transcript = await speechToText(audioBlob);
      if (!transcript.trim()) throw new Error("No speech detected");
      
      setSession(prev => ({ ...prev, userQuery: transcript }));

      // 2. Generate Content
      await processContentGeneration(transcript);

    } catch (error: any) {
      console.error(error);
      const msg = error.message || "Unknown Error";
      alert("Error processing: " + msg);
      setStep('INPUT');
    } finally {
      setIsProcessing(false);
    }
  };

  const processContentGeneration = async (query: string, isSimplification: boolean = false) => {
    try {
      setLoadingMessage('Writing Story... (கதை எழுதுகிறது...)');
      let storyText = "";
      
      if (isSimplification && session.explanationText) {
        storyText = await generateSimplerExplanation(session.explanationText);
        setSession(prev => ({ ...prev, explanationText: storyText }));
      } else {
        const content = await generateScienceContent(
          session.classLevel!, 
          session.topic!.en, 
          query
        );
        storyText = content.story;
        setSession(prev => ({ ...prev, explanationText: content.story, quiz: content.quiz }));
      }

      // 3. TTS
      setLoadingMessage('Generating Audio... (ஒலி உருவாக்கப்படுகிறது...)');
      try {
        const audioUrl = await textToSpeech(storyText);
        setSession(prev => ({ ...prev, explanationAudioUrl: audioUrl }));
      } catch (audioError: any) {
         console.error("Audio Generation Failed:", audioError);
         setAudioError(audioError.message || "Unknown Audio Error");
         setSession(prev => ({ ...prev, explanationAudioUrl: null }));
      }

      setStep('PLAYBACK');

      // Auto play attempt
      setTimeout(() => {
        if (audioPlayerRef.current) {
          const playPromise = audioPlayerRef.current.play();
          if (playPromise !== undefined) {
             playPromise.then(() => setIsPlaying(true))
             .catch(error => {
                console.log("Autoplay blocked, showing controls", error);
                setIsPlaying(false);
             });
          }
        }
      }, 500);

    } catch (e) {
      console.error("Content Generation Failed", e);
      setStep('INPUT'); // Reset on failure
    }
  };

  const handleAction = async (action: 'understood' | 'explain_again' | 'replay') => {
    setSession(prev => ({ ...prev, actionTaken: action }));
    
    if (action === 'replay') {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current.play();
        setIsPlaying(true);
      }
    } else if (action === 'explain_again') {
      setIsProcessing(true);
      setLoadingMessage('Re-thinking... (மீண்டும் சிந்திக்கிறது...)');
      setStep('PROCESSING'); // Show loading
      await processContentGeneration(session.userQuery, true);
      setIsProcessing(false);
    } else {
      // Understood -> Go to Quiz
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
    setShowResult(true);
    setStep('RESULT');

    // Log to Supabase
    await logSession({
      class_level: session.classLevel!,
      topic: session.topic!.en,
      question: session.userQuery,
      action: session.actionTaken || 'unknown',
      quiz_score: correctCount
    });

    // If 0 score, gentle explanation
    if (correctCount === 0) {
        try {
          const comfortAudio = await textToSpeech("பரவாயில்லை! நாம் மீண்டும் முயற்சிப்போம். (It's okay! We will try again.)");
          const audio = new Audio(comfortAudio);
          audio.play();
        } catch(e) { console.warn("Comfort audio failed", e)}
    } else {
        try {
          const congratsAudio = await textToSpeech("வாழ்த்துகள்! சிறப்பாக செய்தீர்கள். (Congratulations! You did well.)");
          const audio = new Audio(congratsAudio);
          audio.play();
        } catch(e) { console.warn("Congrats audio failed", e)}
    }
  };

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
     setShowResult(false);
     setAudioError(null);
  }

  // --- Renders ---

  const Header = () => (
    <div className="w-full p-4 bg-yellow-400 text-slate-900 shadow-md mb-6 sticky top-0 z-10">
      <h1 className="text-xl font-bold font-tamil">FeelEd AI</h1>
      <p className="text-sm font-tamil opacity-90">Science Voice Learning / அறிவியல் குரல் வழி கற்றல்</p>
    </div>
  );

  const Footer = () => (
    <div className="fixed bottom-0 left-0 w-full p-2 bg-slate-50 border-t border-slate-200 text-[10px] flex flex-col items-center justify-center z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <span className="font-bold text-slate-500 uppercase tracking-widest mb-0.5">Powered by SARVAM</span>
      <span className="font-semibold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
        <span>&copy;</span> All rights reserved FeelEd AI 2026
      </span>
    </div>
  );

  const renderClassSelection = () => (
    <div className="grid grid-cols-1 gap-4 p-4 animate-fade-in">
      <h2 className="text-lg font-semibold text-center mb-4 font-tamil">வகுப்பைத் தேர்ந்தெடுக்கவும் <br/> Select Class</h2>
      {['6', '7', '8'].map((cls) => (
        <button
          key={cls}
          onClick={() => handleClassSelect(cls as ClassLevel)}
          className="bg-white border-2 border-yellow-400 rounded-xl p-6 text-2xl font-bold shadow-sm hover:bg-yellow-50 transition active:scale-95 flex justify-between items-center"
        >
          <span>Class {cls}</span>
          <span className="font-tamil">{cls} ஆம் வகுப்பு</span>
        </button>
      ))}
    </div>
  );

  const renderTopicSelection = () => (
    <div className="flex flex-col gap-4 p-4 animate-fade-in">
      <h2 className="text-lg font-semibold text-center mb-4 font-tamil">தலைப்பைத் தேர்ந்தெடுக்கவும் <br/> Select Topic</h2>
      {CURRICULUM[session.classLevel!].map((t) => (
        <button
          key={t.id}
          onClick={() => handleTopicSelect(t)}
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:bg-yellow-50 text-left transition active:scale-95"
        >
          <div className="font-bold text-lg text-yellow-700">{t.en}</div>
          <div className="font-tamil text-slate-600 text-lg mt-1">{t.ta}</div>
        </button>
      ))}
       <button onClick={() => setStep('CLASS_SELECT')} className="mt-4 text-slate-400 underline text-sm">Back / பின்</button>
    </div>
  );

  const renderInput = () => (
    <div className="flex flex-col items-center justify-center h-full p-6 animate-fade-in">
      <h2 className="text-xl font-semibold text-center mb-8 font-tamil">
        கேள்வி கேளுங்கள் <br/> <span className="text-base font-normal">Ask a question in Tamil</span>
      </h2>

      <div className={`relative rounded-full p-2 transition-all duration-300 ${isRecording ? 'bg-red-100 scale-110' : 'bg-yellow-100'}`}>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className={`w-32 h-32 rounded-full flex items-center justify-center shadow-lg transition-all ${
            isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-yellow-400 text-white hover:bg-yellow-500'
          }`}
        >
          {isRecording ? <StopIcon /> : <MicIcon />}
        </button>
      </div>
      
      <p className="mt-8 text-slate-500 text-center font-tamil">
        {isRecording ? "Listening... (பேசவும்)" : "Tap to Speak (பேசத் தட்டவும்)"}
      </p>

      {!isRecording && (
        <div className="mt-8 w-full max-w-sm">
            <input 
                type="text" 
                placeholder="Or type here / அல்லது தட்டச்சு செய்க" 
                className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:border-yellow-500"
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        const val = e.currentTarget.value;
                        setSession(prev => ({...prev, userQuery: val}));
                        processContentGeneration(val);
                        setStep('PROCESSING');
                    }
                }}
            />
        </div>
      )}
    </div>
  );

  const renderProcessing = () => (
    <div className="flex flex-col items-center justify-center p-12 text-center animate-fade-in">
        <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-6"></div>
        <p className="font-tamil text-xl text-slate-700">{loadingMessage}</p>
    </div>
  )

  const renderPlayback = () => (
    <div className="flex flex-col h-full p-4 animate-fade-in max-w-lg mx-auto">
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border-l-4 border-yellow-400">
        <h3 className="text-sm font-bold text-yellow-600 mb-2 uppercase">You asked:</h3>
        <p className="font-tamil text-lg mb-4">{session.userQuery}</p>
        <div className="h-px bg-slate-100 w-full mb-4"></div>
        
        <h3 className="text-sm font-bold text-green-600 mb-2 uppercase">Explanation:</h3>
        <p className="font-tamil text-lg leading-relaxed">{session.explanationText}</p>
      </div>

      <div className="w-full mb-6">
        {session.explanationAudioUrl ? (
          <audio 
              ref={audioPlayerRef} 
              src={session.explanationAudioUrl} 
              controls 
              className="w-full rounded-lg shadow-sm border border-slate-200"
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
          />
        ) : (
          <div className="p-4 bg-red-50 text-red-600 rounded-lg text-center font-tamil border border-red-200 text-sm">
             <div className="font-bold">Audio Unavailable / ஒலி இல்லை</div>
             <div>{audioError || "Unknown Error"}</div>
          </div>
        )}
      </div>

      <div className="mt-auto space-y-3">
        <p className="text-center text-slate-500 font-tamil mb-2">Did you understand? / புரிந்ததா?</p>
        
        <button onClick={() => handleAction('understood')} className="w-full bg-green-500 text-white p-4 rounded-xl font-bold font-tamil shadow-md active:scale-95 transition">
          ஆம், புரிந்தது (Yes, Understood)
        </button>
        
        <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleAction('explain_again')} className="bg-orange-100 text-orange-700 p-4 rounded-xl font-bold font-tamil shadow-sm active:scale-95 transition">
             விளக்கவும் (Explain Again)
            </button>
            <button 
              onClick={() => handleAction('replay')} 
              disabled={!session.explanationAudioUrl}
              className="bg-blue-100 text-blue-700 p-4 rounded-xl font-bold font-tamil shadow-sm active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
             <span>மீண்டும் கேட்க</span> {isPlaying && <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping"/>}
            </button>
        </div>
      </div>
    </div>
  );

  const renderQuiz = () => (
    <div className="p-4 max-w-lg mx-auto animate-fade-in">
        <h2 className="text-xl font-bold font-tamil text-center mb-6">குறு வினாடி வினா (Quiz)</h2>
        <div className="space-y-6">
            {session.quiz.map((q, qIdx) => (
                <div key={q.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                    <p className="font-tamil font-semibold text-lg mb-3">{qIdx + 1}. {q.question}</p>
                    <div className="space-y-2">
                        {q.options.map((opt, oIdx) => (
                            <button
                                key={oIdx}
                                onClick={() => handleQuizAnswer(qIdx, oIdx)}
                                className={`w-full text-left p-3 rounded-lg font-tamil transition ${
                                    quizAnswers[qIdx] === oIdx 
                                    ? 'bg-yellow-200 border-yellow-400' 
                                    : 'bg-slate-50 hover:bg-slate-100'
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
            className="w-full mt-8 bg-yellow-500 disabled:bg-slate-300 text-white p-4 rounded-xl font-bold shadow-md"
        >
            முடிவுகளை காட்டு (Show Results)
        </button>
    </div>
  );

  const renderResult = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center animate-fade-in">
        <div className="text-6xl mb-4">
            {session.score > 0 ? '🌟' : '🌱'}
        </div>
        <h2 className="text-2xl font-bold font-tamil mb-2">
            {session.score > 0 ? 'வாழ்த்துகள்! (Congratulations)' : 'பரவாயில்லை! (Keep trying)'}
        </h2>
        <p className="text-xl text-slate-600 mb-8">
            Score: {session.score} / {session.quiz.length}
        </p>

        <button 
            onClick={resetApp}
            className="bg-yellow-400 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-yellow-500 transition"
        >
            முகப்பு பக்கம் (Home)
        </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <Header />
      <div className="max-w-2xl mx-auto">
        {step === 'CLASS_SELECT' && renderClassSelection()}
        {step === 'TOPIC_SELECT' && renderTopicSelection()}
        {step === 'INPUT' && renderInput()}
        {step === 'PROCESSING' && renderProcessing()}
        {step === 'PLAYBACK' && renderPlayback()}
        {step === 'QUIZ' && renderQuiz()}
        {step === 'RESULT' && renderResult()}
      </div>
      <Footer />
    </div>
  );
}

export default App;