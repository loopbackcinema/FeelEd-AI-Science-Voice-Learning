export type ClassLevel = '6' | '7' | '8';

export interface Topic {
  id: string;
  en: string;
  ta: string;
}

export interface Curriculum {
  [key: string]: Topic[];
}

export type AppStep = 
  | 'CLASS_SELECT' 
  | 'TOPIC_SELECT' 
  | 'INPUT' 
  | 'PROCESSING' 
  | 'PLAYBACK' 
  | 'QUIZ' 
  | 'RESULT';

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface LearningSession {
  classLevel: ClassLevel | null;
  topic: Topic | null;
  userQuery: string;
  explanationText: string;
  explanationAudioUrl: string | null;
  quiz: QuizQuestion[];
  score: number;
  actionTaken: 'understood' | 'explain_again' | 'replay' | null;
}