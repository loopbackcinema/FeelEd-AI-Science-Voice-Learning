// Helper to safely get env vars by explicit checking (required for bundlers)
const getSarvamKey = (): string => {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.SARVAM_API_KEY) return process.env.SARVAM_API_KEY;
    if (process.env.NEXT_PUBLIC_SARVAM_API_KEY) return process.env.NEXT_PUBLIC_SARVAM_API_KEY;
    if (process.env.REACT_APP_SARVAM_API_KEY) return process.env.REACT_APP_SARVAM_API_KEY;
    if (process.env.VITE_SARVAM_API_KEY) return process.env.VITE_SARVAM_API_KEY;
  }
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    if (import.meta.env.SARVAM_API_KEY) return import.meta.env.SARVAM_API_KEY;
    // @ts-ignore
    if (import.meta.env.VITE_SARVAM_API_KEY) return import.meta.env.VITE_SARVAM_API_KEY;
    // @ts-ignore
    if (import.meta.env.NEXT_PUBLIC_SARVAM_API_KEY) return import.meta.env.NEXT_PUBLIC_SARVAM_API_KEY;
  }
  return '';
};

const SARVAM_API_KEY = getSarvamKey();

// Mock Sarvam functionality if API key is missing (for UI testing without credits)
const isMock = !SARVAM_API_KEY;

export const speechToText = async (audioBlob: Blob): Promise<string> => {
  if (isMock) {
    console.warn("SARVAM_API_KEY not found. Using Mock ASR.");
    return new Promise(resolve => setTimeout(() => resolve("சூரியன் ஏன் சூடாக இருக்கிறது?"), 1000));
  }

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', 'saaras:v1'); 

  try {
    const response = await fetch('https://api.sarvam.ai/speech-to-text-translate', {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`ASR API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.transcript || "";
  } catch (error) {
    console.error("ASR Error:", error);
    throw error;
  }
};

export const textToSpeech = async (text: string): Promise<string> => {
  if (isMock) {
     console.warn("SARVAM_API_KEY not found. Using Mock TTS.");
     // Return a simple beep or silent track for demo
     return "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
  }

  try {
    const response = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': SARVAM_API_KEY,
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: 'ta-IN',
        speaker: 'meera',
        pitch: 0,
        pace: 1.0,
        loudness: 1.5,
        speech_sample_rate: 16000,
        enable_preprocessing: true,
        model: 'bulbul:v1'
      }),
    });

    if (!response.ok) {
        throw new Error(`TTS API Error: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.audios && data.audios[0]) {
        return `data:audio/wav;base64,${data.audios[0]}`;
    }
    throw new Error("No audio data received");

  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};