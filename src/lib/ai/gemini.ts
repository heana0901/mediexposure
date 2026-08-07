import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import type { AiCallResult, Source } from "./chatgpt";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function extractSources(response: GenerateContentResponse): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ title: chunk.web?.title || uri, url: uri });
  }

  return sources;
}

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
    sources: extractSources(response),
  };
}
