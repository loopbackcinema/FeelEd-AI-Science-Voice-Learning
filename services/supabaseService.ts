import { createClient } from '@supabase/supabase-js';

// Use specific project URL and support multiple key variable names
const SUPABASE_URL = 'https://ingkmgyoldwhxgzphfzi.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_KEY) {
  console.warn("⚠️ Supabase Key is MISSING. Logging will not work. Check your .env file or environment variables.");
} else {
  console.log("✅ Supabase Key found. Initializing client...");
}

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
    console.warn("Supabase not configured (Missing Key)");
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
      console.error('❌ Supabase Logging Error:', error.message, error.details);
    } else {
      console.log('✅ Supabase Log Inserted Successfully:', data);
    }
  } catch (err) {
    console.error('❌ Supabase Unexpected Error:', err);
  }
};