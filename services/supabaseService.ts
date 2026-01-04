import { createClient } from '@supabase/supabase-js';

const getEnvUrl = (): string => {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
    if (process.env.REACT_APP_SUPABASE_URL) return process.env.REACT_APP_SUPABASE_URL;
  }
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
     // @ts-ignore
     if (import.meta.env.NEXT_PUBLIC_SUPABASE_URL) return import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
     // @ts-ignore
     if (import.meta.env.VITE_SUPABASE_URL) return import.meta.env.VITE_SUPABASE_URL;
  }
  return '';
}

const getEnvKey = (): string => {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY; // Sometimes used if build exposes it
    if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
    if (process.env.REACT_APP_SUPABASE_ANON_KEY) return process.env.REACT_APP_SUPABASE_ANON_KEY;
  }
   // @ts-ignore
   if (typeof import.meta !== 'undefined' && import.meta.env) {
     // @ts-ignore
     if (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
     // @ts-ignore
     if (import.meta.env.VITE_SUPABASE_ANON_KEY) return import.meta.env.VITE_SUPABASE_ANON_KEY;
  }
  return '';
}

const SUPABASE_URL = getEnvUrl();
const SUPABASE_KEY = getEnvKey();

// Initialize client only if keys are present (prevents crash in dev if missing)
const supabase = (SUPABASE_URL && SUPABASE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

export const logSession = async (data: {
  class_level: string;
  topic: string;
  question: string;
  action: string;
  quiz_score: number;
}) => {
  if (!supabase) {
    console.warn("Supabase not configured, skipping log");
    return;
  }

  try {
    const { error } = await supabase
      .from('feeled_logs')
      .insert([
        {
          ...data,
          channel: 'web',
          created_at: new Date().toISOString(),
        },
      ]);

    if (error) {
      console.error('Supabase error:', error);
    }
  } catch (err) {
    console.error('Logging failed:', err);
  }
};