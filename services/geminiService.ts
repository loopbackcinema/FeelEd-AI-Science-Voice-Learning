import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion } from '../types';

// Strictly adhering to Google GenAI SDK Coding Guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateScienceContent = async (
  classLevel: string,
  topic: string,
  query: string
): Promise<{ story: string; quiz: QuizQuestion[] }> => {
  const prompt = `
    You are a friendly science teacher for rural students in Tamil Nadu, India.
    Class Level: ${classLevel}
    Topic: ${topic}
    Student Question: "${query}"

    Task 1: Create an EXPLANATION STORY in TAMIL.
    - TARGET LENGTH: Approx 130-150 words.
    - Use simple spoken Tamil.
    - Use a detailed real-world analogy relevant to village life.
    - Tone: Encouraging, storytelling.

    Task 2: Create a quiz with 3 questions based strictly on the explanation.
    - Multiple choice, in Tamil.
  `;

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
            correctIndex: { type: Type.INTEGER },
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

    const text = response.text; // Access as a property, not a method
    if (text) {
      return JSON.parse(text);
    }
    throw new Error("Empty response from AI");
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      story: "மன்னிக்கவும், தகவல் சேகரிப்பதில் சிறு தடை ஏற்பட்டுள்ளது. மீண்டும் முயற்சி செய்யவும்.",
      quiz: []
    };
  }
};

export const generateSimplerExplanation = async (previousStory: string): Promise<string> => {
  const prompt = `Rewrite this story to be MUCH simpler for a child, using shorter sentences in Tamil: "${previousStory}"`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.7 }
    });
    return response.text || previousStory;
  } catch (e) {
    return previousStory;
  }
};