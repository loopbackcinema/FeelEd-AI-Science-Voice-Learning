import { createClient } from '@supabase/supabase-js';

// Strictly use Next.js standard environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Initialize client only if keys are present
// This allows the app to run (without logging) even if Supabase isn't configured yet.
const supabase = (SUPABASE_URL && SUPABASE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_KEY) 
  : null;

if (!supabase) {
  console.warn("FeelEd Log: Supabase is not configured. (Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)");
}

export const logSession = async (data: {
  class_level: string;
  topic: string;
  question: string;
  action: string;
  quiz_score: number;
}) => {
  if (!supabase) {
    // Fail silently in UI, but log to console for dev
    console.warn("Skipping Supabase Log: Credentials missing.");
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
      console.error('Supabase Insert Error:', error.message);
    } else {
      console.log("Session logged to Supabase.");
    }
  } catch (err) {
    console.error('Supabase Exception:', err);
  }
};