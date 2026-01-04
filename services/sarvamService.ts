// services/sarvamService.ts

// Helper to split long text into chunks (Shared logic)
const chunkText = (text: string, maxLength: number = 300): string[] => {
  const chunks: string[] = [];
  
  // 1. Split by sentence endings
  const rawSentences = text.split(/([.?!।]\s+)/);
  const sentences: string[] = [];
  
  // Re-assemble split punctuation
  for (let i = 0; i < rawSentences.length; i += 2) {
    const s = rawSentences[i];
    const p = rawSentences[i + 1] || '';
    if (s || p) sentences.push(s + p);
  }

  let currentChunk = '';

  for (const part of sentences) {
    if (part.length > maxLength) {
        if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        const words = part.split(' ');
        let subChunk = '';
        for(const w of words) {
            if (subChunk.length + w.length + 1 > maxLength) {
                chunks.push(subChunk.trim());
                subChunk = w + ' ';
            } else {
                subChunk += w + ' ';
            }
        }
        if (subChunk) currentChunk = subChunk;
        continue;
    }

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

// --- ROBUST WAV MERGING LOGIC (Client Side) ---

const findDataChunkOffset = (view: DataView): { offset: number, size: number } | null => {
  try {
    let offset = 12; 
    while (offset < view.byteLength) {
      if (offset + 8 > view.byteLength) break;
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === 'data') {
        return { offset: offset + 8, size: chunkSize };
      }
      offset += 8 + chunkSize;
    }
  } catch (e) {
    console.warn("Error parsing WAV structure", e);
  }
  return null;
};

const mergeWavBase64 = async (base64List: string[]): Promise<string> => {
  if (base64List.length === 0) return '';
  if (base64List.length === 1) return `data:audio/wav;base64,${base64List[0]}`;

  try {
    const audioBuffers = base64List.map(b64 => {
      const binaryString = atob(b64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    });

    const pcmParts: Uint8Array[] = [];
    let totalLength = 0;

    for (const buffer of audioBuffers) {
      const view = new DataView(buffer.buffer);
      const dataInfo = findDataChunkOffset(view);
      
      if (dataInfo) {
        const pcmData = buffer.slice(dataInfo.offset, dataInfo.offset + dataInfo.size);
        pcmParts.push(pcmData);
        totalLength += pcmData.length;
      } else {
        if (buffer.length > 44) {
            const pcmData = buffer.slice(44);
            pcmParts.push(pcmData);
            totalLength += pcmData.length;
        }
      }
    }

    if (totalLength === 0) return `data:audio/wav;base64,${base64List[0]}`;

    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + totalLength, true); 
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); 
    view.setUint16(20, 1, true); 
    view.setUint16(22, 1, true); 
    view.setUint32(24, 16000, true); 
    view.setUint32(28, 16000 * 1 * 2, true); 
    view.setUint16(32, 2, true); 
    view.setUint16(34, 16, true); 
    writeString(view, 36, 'data');
    view.setUint32(40, totalLength, true);

    const finalBuffer = new Uint8Array(44 + totalLength);
    finalBuffer.set(new Uint8Array(header), 0);
    
    let offset = 44;
    for (const part of pcmParts) {
      finalBuffer.set(part, offset);
      offset += part.length;
    }

    let binary = '';
    const len = finalBuffer.byteLength;
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < len; i += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, Array.from(finalBuffer.subarray(i, Math.min(i + CHUNK_SIZE, len))));
    }
    
    return `data:audio/wav;base64,${btoa(binary)}`;

  } catch (e) {
    console.error("Error merging WAVs", e);
    return `data:audio/wav;base64,${base64List[0]}`; 
  }
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// --- API CALLS (Proxied via Next.js API Routes) ---

export const speechToText = async (audioBlob: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', 'saaras:v1'); 

  try {
    // Call local API route which holds the secret key
    const response = await fetch('/api/sarvam/asr', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`ASR Error: ${errData.error || response.statusText}`);
    }

    const data = await response.json();
    return data.transcript || "";
  } catch (error) {
    console.error("ASR Service Error:", error);
    throw error;
  }
};

export const textToSpeech = async (text: string): Promise<string> => {
  try {
    const chunks = chunkText(text);
    console.log(`TTS: Processing ${chunks.length} chunks via proxy.`);
    
    const audioBase64List: string[] = [];

    // Process chunks sequentially
    for (const chunk of chunks) {
      // Call local API route which holds the secret key
      const response = await fetch('/api/sarvam/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        console.warn("TTS Chunk Proxy Failed:", await response.text());
        continue;
      }

      const data = await response.json();
      if (data.audios && data.audios[0]) {
        audioBase64List.push(data.audios[0]);
      }
    }

    if (audioBase64List.length === 0) {
      throw new Error("No audio chunks generated.");
    }

    return await mergeWavBase64(audioBase64List);

  } catch (error) {
    console.error("TTS Service Error:", error);
    throw error;
  }
};