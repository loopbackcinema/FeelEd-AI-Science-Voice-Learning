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

// Helper to split long text into chunks
const chunkText = (text: string, maxLength: number = 400): string[] => {
  const chunks: string[] = [];
  let currentChunk = '';
  
  // Split by sentence endings for natural pauses
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

// --- ROBUST WAV MERGING LOGIC ---

// Helper to find the start of the 'data' chunk in a WAV file
const findDataChunkOffset = (view: DataView): { offset: number, size: number } | null => {
  // RIFF(4) + Size(4) + WAVE(4) = 12 bytes
  let offset = 12; 
  while (offset < view.byteLength) {
    // Read Chunk ID (4 bytes)
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    // Read Chunk Size (4 bytes, little endian)
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'data') {
      return { offset: offset + 8, size: chunkSize };
    }

    // Move to next chunk
    offset += 8 + chunkSize;
  }
  return null;
};

const mergeWavBase64 = async (base64List: string[]): Promise<string> => {
  if (base64List.length === 0) return '';
  if (base64List.length === 1) return `data:audio/wav;base64,${base64List[0]}`;

  try {
    // 1. Decode all base64 to buffers
    const audioBuffers = base64List.map(b64 => {
      const binaryString = atob(b64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    });

    // 2. Extract raw PCM data from each WAV
    const pcmParts: Uint8Array[] = [];
    let totalLength = 0;

    for (const buffer of audioBuffers) {
      const view = new DataView(buffer.buffer);
      const dataInfo = findDataChunkOffset(view);
      
      if (dataInfo) {
        // Extract strictly the audio data, skipping header/metadata
        const pcmData = buffer.slice(dataInfo.offset, dataInfo.offset + dataInfo.size);
        pcmParts.push(pcmData);
        totalLength += pcmData.length;
      } else {
        console.warn("Could not find data chunk in a WAV segment, skipping.");
      }
    }

    // 3. Create a clean 44-byte WAV header
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    // RIFF
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + totalLength, true); // File size
    writeString(view, 8, 'WAVE');
    
    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, 1, true); // NumChannels (Mono = 1) - Sarvam usually returns mono
    view.setUint32(24, 16000, true); // SampleRate (16kHz)
    view.setUint32(28, 16000 * 1 * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, totalLength, true);

    // 4. Concatenate Header + All PCM Parts
    const finalBuffer = new Uint8Array(44 + totalLength);
    finalBuffer.set(new Uint8Array(header), 0);
    
    let offset = 44;
    for (const part of pcmParts) {
      finalBuffer.set(part, offset);
      offset += part.length;
    }

    // 5. Convert back to base64
    let binary = '';
    const len = finalBuffer.byteLength;
    // Process in chunks to avoid call stack size exceeded
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < len; i += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, Array.from(finalBuffer.subarray(i, Math.min(i + CHUNK_SIZE, len))));
    }
    
    return `data:audio/wav;base64,${btoa(binary)}`;

  } catch (e) {
    console.error("Error merging WAVs", e);
    // Fallback: return the first chunk so at least something plays
    return `data:audio/wav;base64,${base64List[0]}`; 
  }
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

export const speechToText = async (audioBlob: Blob): Promise<string> => {
  if (!SARVAM_API_KEY) {
    throw new Error("SARVAM_API_KEY is missing in Environment Variables");
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
     throw new Error("SARVAM_API_KEY is missing in Environment Variables");
  }

  try {
    const chunks = chunkText(text);
    console.log(`TTS: Processing ${chunks.length} chunks.`);
    
    // Process sequentially to preserve order and avoid rate limits
    const audioBase64List: string[] = [];

    for (const chunk of chunks) {
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
        continue;
      }

      const data = await response.json();
      if (data.audios && data.audios[0]) {
        audioBase64List.push(data.audios[0]);
      }
    }

    if (audioBase64List.length === 0) {
      throw new Error("No audio generated from Sarvam");
    }

    // Merge chunks into one valid WAV file
    return await mergeWavBase64(audioBase64List);

  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};