import { GoogleGenAI } from "@google/genai";
import type { AiCallResult } from "./chatgpt";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function askGemini(question: string): Promise<AiCallResult> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await ai.models.generateContent({
    model,
    contents: question,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  return {
    text: response.text ?? "",
    model,
    inputTokens: response.usageMetadata?.promptTokenCount ?? null,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
  };
}
