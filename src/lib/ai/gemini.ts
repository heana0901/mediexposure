import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import type { AiCallResult, AskOptions, Source } from "./types";

let ai: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

function extractSources(response: GenerateContentResponse): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  for (const chunk of chunks) {
    // 지도 그라운딩을 켜면 장소 카드(maps)도 근거로 들어온다
    const ref = chunk.web ?? chunk.maps;
    const uri = ref?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ title: ref?.title || uri, url: uri });
  }

  return sources;
}

function sumTokens(...counts: (number | undefined)[]): number | null {
  const known = counts.filter((n): n is number => typeof n === "number");
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

export async function askGemini(question: string, options: AskOptions = {}): Promise<AiCallResult> {
  const model = options.model || process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const maps = options.maps;
  const response = await getClient().models.generateContent({
    model,
    contents: question,
    config: {
      tools: maps ? [{ googleSearch: {} }, { googleMaps: {} }] : [{ googleSearch: {} }],
      ...(maps
        ? { toolConfig: { retrievalConfig: { latLng: maps, languageCode: "ko" } } }
        : {}),
      ...(options.instructions ? { systemInstruction: options.instructions } : {}),
    },
  });

  const grounding = response.candidates?.[0]?.groundingMetadata;
  const searchQueries = grounding?.webSearchQueries ?? [];
  const sources = extractSources(response);

  return {
    text: response.text ?? "",
    model,
    inputTokens: response.usageMetadata?.promptTokenCount ?? null,
    // 3.x 모델은 생각(thinking) 토큰도 출력 단가로 청구된다
    outputTokens: sumTokens(
      response.usageMetadata?.candidatesTokenCount,
      response.usageMetadata?.thoughtsTokenCount
    ),
    sources,
    searched: searchQueries.length > 0 || sources.length > 0,
    searchQueries,
    searchCount: searchQueries.length,
  };
}
