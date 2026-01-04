import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion } from '../types';

// Use the Gemini API for the "Intelligence" part of the app
// Using Gemini 3 Flash for optimal performance and Tamil language support.

// Helper to safely get env vars without crashing
const getEnv = (key: string) => {
  // Check process.env (Standard/Next.js)
  if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
  // Check import.meta.env (Vite)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) return import.meta.env[key];
  return '';
};

const apiKey = getEnv('GEMINI_API_KEY') || getEnv('NEXT_PUBLIC_GEMINI_API_KEY') || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateScienceContent = async (
  classLevel: string,
  topic: string,
  query: string
): Promise<{ story: string; quiz: QuizQuestion[] }> => {
  if (!ai) {
    console.error("Gemini API Key is missing. Please set GEMINI_API_KEY in Vercel.");
    return {
      story: "மன்னிக்கவும். தொழில்நுட்ப கோளாறு காரணமாக என்னால் இப்போது பதில் சொல்ல முடியவில்லை. (API Key Missing)",
      quiz: []
    };
  }

  const prompt = `
    You are a friendly science teacher for rural students in Tamil Nadu, India.
    Class Level: ${classLevel}
    Topic: ${topic}
    Student Question: "${query}"

    Task 1: Create a SHORT explanation story in TAMIL.
    - Use simple spoken Tamil (Tanglish style is okay if it helps clarity, but prefer clear Tamil).
    - Use a real-world analogy relevant to village/daily life.
    - Max length: 90 words.
    - Tone: Encouraging, storytelling.

    Task 2: Create a quiz with 3 questions based strictly on the explanation.
    - Multiple choice.
    - In Tamil.
  `;

  // Schema for structured output
  const schema = {
    type: Type.OBJECT,
    properties: {
      story: { type: Type.STRING, description: "The explanation story in Tamil" },
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
      
      Please rewrite it to be MUCH simpler. 
      - Use shorter sentences.
      - Use a different, easier analogy.
      - Keep it under 60 words.
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