import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion } from '../types';

// Use the Gemini API for the "Intelligence" part of the app
// Using Gemini 3 Flash for optimal performance and Tamil language support.

// NOTE: We must access process.env.VAR_NAME directly for bundlers (Vite/Next/Webpack) to replace them at build time.
// Dynamic access like process.env[key] often fails in client-side builds.

const getGeminiKey = (): string => {
  // Try standard Node/Next.js
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    if (process.env.NEXT_PUBLIC_GEMINI_API_KEY) return process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (process.env.REACT_APP_GEMINI_API_KEY) return process.env.REACT_APP_GEMINI_API_KEY;
    if (process.env.VITE_GEMINI_API_KEY) return process.env.VITE_GEMINI_API_KEY;
  }
  // Try Vite import.meta
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    if (import.meta.env.GEMINI_API_KEY) return import.meta.env.GEMINI_API_KEY;
    // @ts-ignore
    if (import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY;
    // @ts-ignore
    if (import.meta.env.NEXT_PUBLIC_GEMINI_API_KEY) return import.meta.env.NEXT_PUBLIC_GEMINI_API_KEY;
  }
  return '';
};

const apiKey = getGeminiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateScienceContent = async (
  classLevel: string,
  topic: string,
  query: string
): Promise<{ story: string; quiz: QuizQuestion[] }> => {
  if (!ai) {
    console.error("Gemini API Key is missing. Checked: GEMINI_API_KEY, NEXT_PUBLIC_GEMINI_API_KEY, VITE_GEMINI_API_KEY.");
    return {
      story: "மன்னிக்கவும். தொழில்நுட்ப கோளாறு காரணமாக என்னால் இப்போது பதில் சொல்ல முடியவில்லை. (API Key Missing - Check Console)",
      quiz: []
    };
  }

  const prompt = `
    You are a friendly science teacher for rural students in Tamil Nadu, India.
    Class Level: ${classLevel}
    Topic: ${topic}
    Student Question: "${query}"

    Task 1: Create an EXPLANATION STORY in TAMIL.
    - TARGET LENGTH: Approx 200-220 words (This must take about 90 seconds to read aloud).
    - Use simple spoken Tamil (Tanglish style is okay if it helps clarity, but prefer clear Tamil).
    - Use a detailed real-world analogy relevant to village/daily life to fill the time meaningfully.
    - Tone: Encouraging, storytelling, slow-paced.

    Task 2: Create a quiz with 3 questions based strictly on the explanation.
    - Multiple choice.
    - In Tamil.
  `;

  // Schema for structured output
  const schema = {
    type: Type.OBJECT,
    properties: {
      story: { type: Type.STRING, description: "The explanation story in Tamil (approx 200 words)" },
      quiz: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.INTEGER },
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctIndex: { type: Type.INTEGER, description: "0-based index of correct answer" },
          },
          required: ["id", "question", "options", "correctIndex"],
        },
      },
    },
    required: ["story", "quiz"],
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.7,
      },
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("No content generated");

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    return {
      story: "மன்னிக்கவும். தொழில்நுட்ப கோளாறு காரணமாக என்னால் இப்போது பதில் சொல்ல முடியவில்லை. (System Error)",
      quiz: []
    };
  }
};

export const generateSimplerExplanation = async (previousStory: string): Promise<string> => {
    if (!ai) return "Error";
    
    const prompt = `
      The student did not understand this explanation:
      "${previousStory}"
      
      Please rewrite it to be MUCH simpler but keep it DETAILED enough to understand.
      - Use shorter sentences.
      - Use a different, easier analogy.
      - Target Length: 100-120 words.
      - Language: Tamil.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        return response.text || "Error regenerating";
    } catch (e) {
        return previousStory;
    }
}