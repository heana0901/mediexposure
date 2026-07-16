import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function askGemini(question: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: question,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  return response.text ?? "";
}
