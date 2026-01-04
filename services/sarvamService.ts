// Helper to convert Blob to Base64 for API transmission
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data URL prefix (e.g., "data:audio/wav;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const SARVAM_API_KEY = process.env.SARVAM_API_KEY || '';

// Mock Sarvam functionality if API key is missing (for UI testing without credits)
const isMock = !SARVAM_API_KEY;

export const speechToText = async (audioBlob: Blob): Promise<string> => {
  if (isMock) {
    console.log("Mocking ASR...");
    return new Promise(resolve => setTimeout(() => resolve("சூரியன் ஏன் சூடாக இருக்கிறது?"), 1000));
  }

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', 'saaras:v1'); // Assuming Saaras model for ASR

  try {
    // Note: In a real Next.js app, this fetch would go to an internal API route (e.g., /api/asr) 
    // to hide the SARVAM_API_KEY. For this SPA output, we call directly.
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
     console.log("Mocking TTS...");
     // Return a dummy audio URL (short beep or silence)
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
        speaker: 'meera', // Assuming a friendly female voice
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
    // Sarvam returns base64 audio usually
    if (data.audios && data.audios[0]) {
        return `data:audio/wav;base64,${data.audios[0]}`;
    }
    throw new Error("No audio data received");

  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};
