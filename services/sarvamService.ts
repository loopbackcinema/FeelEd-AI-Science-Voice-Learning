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

// Helper to split long text into chunks (Sarvam limit ~500 chars usually)
const chunkText = (text: string, maxLength: number = 450): string[] => {
  const chunks: string[] = [];
  let currentChunk = '';
  
  // Split by sentence endings (Tamil full stop or standard)
  const sentences = text.split(/([.?!।]\s+)/);

  for (const part of sentences) {
    if (currentChunk.length + part.length > maxLength) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = part;
    } else {
      currentChunk += part;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  
  return chunks.filter(c => c.length > 0);
};

// Helper to merge multiple WAV base64 strings
const mergeWavBase64 = async (base64List: string[]): Promise<string> => {
  if (base64List.length === 0) return '';
  if (base64List.length === 1) return `data:audio/wav;base64,${base64List[0]}`;

  try {
    const buffers = base64List.map(b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    
    // First buffer has the header we'll use (44 bytes standard WAV)
    const header = buffers[0].slice(0, 44);
    const bodyChunks = buffers.map((b, i) => i === 0 ? b.slice(44) : b.slice(44)); // Strip headers from all, re-add header later
    // Actually, first chunk header is useful, but we need to update size. 
    // Let's strip headers from ALL and prepend a new header or reused header.
    
    const totalDataLength = bodyChunks.reduce((acc, b) => acc + b.length, 0);
    const mergedBody = new Uint8Array(totalDataLength);
    
    let offset = 0;
    for (const chunk of bodyChunks) {
      mergedBody.set(chunk, offset);
      offset += chunk.length;
    }

    // Update Header info
    // WAV Header format:
    // Bytes 4-7: ChunkSize (36 + SubChunk2Size)
    // Bytes 40-43: SubChunk2Size (Data length)
    
    const newHeader = new Uint8Array(header);
    const dataSize = totalDataLength;
    const fileSize = 36 + dataSize;

    // Helper to write LE uint32
    const writeUInt32LE = (arr: Uint8Array, val: number, offset: number) => {
      arr[offset] = val & 0xFF;
      arr[offset + 1] = (val >>> 8) & 0xFF;
      arr[offset + 2] = (val >>> 16) & 0xFF;
      arr[offset + 3] = (val >>> 24) & 0xFF;
    };

    writeUInt32LE(newHeader, fileSize, 4);
    writeUInt32LE(newHeader, dataSize, 40);

    // Combine
    const finalFile = new Uint8Array(newHeader.length + mergedBody.length);
    finalFile.set(newHeader, 0);
    finalFile.set(mergedBody, newHeader.length);

    // Convert back to base64
    let binary = '';
    const len = finalFile.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(finalFile[i]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;

  } catch (e) {
    console.error("Error merging WAVs", e);
    return `data:audio/wav;base64,${base64List[0]}`; // Fallback to first chunk
  }
};

export const speechToText = async (audioBlob: Blob): Promise<string> => {
  if (!SARVAM_API_KEY) {
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
  if (!SARVAM_API_KEY) {
     console.warn("SARVAM_API_KEY not found. Using Mock TTS (Beep).");
     return "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
  }

  try {
    const chunks = chunkText(text);
    console.log(`TTS: Split text into ${chunks.length} chunks for processing.`);
    
    const audioPromises = chunks.map(async (chunk) => {
      const response = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': SARVAM_API_KEY,
        },
        body: JSON.stringify({
          inputs: [chunk],
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
        console.error("TTS Chunk Failed", await response.text());
        return null;
      }

      const data = await response.json();
      if (data.audios && data.audios[0]) {
        return data.audios[0] as string; // Base64 string (no data URI prefix yet)
      }
      return null;
    });

    const results = await Promise.all(audioPromises);
    const validBase64s = results.filter((r): r is string => r !== null);

    if (validBase64s.length === 0) {
      throw new Error("No audio generated from Sarvam");
    }

    // Merge chunks into one WAV
    return await mergeWavBase64(validBase64s);

  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};