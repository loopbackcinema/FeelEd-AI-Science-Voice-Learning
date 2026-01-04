import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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