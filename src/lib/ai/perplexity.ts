import OpenAI from "openai";
import type { LocationHint } from "../location";
import type { AiCallResult, AskOptions, Source } from "./types";

/**
 * Perplexity Agent API (구 Sonar Chat Completions의 후속).
 * OpenAI Responses API와 호환되는 /v1/responses 엔드포인트를 제공하므로 openai SDK를 그대로 쓴다.
 * 응답에는 OpenAI 타입에 없는 항목(search_results, usage.cost)이 섞여 있어 아래에서 직접 읽는다.
 */
const BASE_URL = "https://api.perplexity.ai/v1";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: process.env.PERPLEXITY_API_KEY, baseURL: BASE_URL });
  return client;
}

type SearchResultsItem = {
  type: "search_results";
  queries?: string[];
  results?: { url?: string; title?: string }[];
};

type MessageItem = {
  type: "message";
  content?: { type: string; text?: string; annotations?: { type?: string; url?: string; title?: string }[] }[];
};

type PerplexityResponse = {
  output?: (SearchResultsItem | MessageItem | { type: string })[];
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cost?: { total_cost?: number };
  };
};

function userLocation(location?: LocationHint | null) {
  return {
    country: "KR",
    ...(location?.city ? { city: location.city } : {}),
    ...(location?.region ? { region: location.region } : {}),
  };
}

function isSearchResults(item: { type: string }): item is SearchResultsItem {
  return item.type === "search_results";
}

function isMessage(item: { type: string }): item is MessageItem {
  return item.type === "message";
}

function extractText(response: PerplexityResponse): string {
  if (response.output_text) return response.output_text;
  return (response.output ?? [])
    .filter(isMessage)
    .flatMap((item) => item.content ?? [])
    .flatMap((part) => (part.type === "output_text" && part.text ? [part.text] : []))
    .join("");
}

function extractSources(response: PerplexityResponse): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  const add = (url?: string, title?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    sources.push({ title: title || url, url });
  };

  // 답변에 직접 인용된 링크를 먼저, 그다음 검색 결과 목록 순으로 담는다
  for (const item of (response.output ?? []).filter(isMessage)) {
    for (const part of item.content ?? []) {
      for (const annotation of part.annotations ?? []) add(annotation.url, annotation.title);
    }
  }
  for (const item of (response.output ?? []).filter(isSearchResults)) {
    for (const result of item.results ?? []) add(result.url, result.title);
  }

  return sources;
}

export async function askPerplexity(question: string, options: AskOptions = {}): Promise<AiCallResult> {
  const model = process.env.PERPLEXITY_MODEL || "perplexity/sonar";

  const params = {
    model,
    input: question,
    ...(options.instructions ? { instructions: options.instructions } : {}),
    tools: [{ type: "web_search", user_location: userLocation(options.location) }],
  };

  const response = (await getClient().responses.create(
    params as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming
  )) as unknown as PerplexityResponse;

  const searchItems = (response.output ?? []).filter(isSearchResults);
  const searchQueries = [...new Set(searchItems.flatMap((item) => item.queries ?? []))];
  const totalCost = response.usage?.cost?.total_cost;

  return {
    text: extractText(response),
    model,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    sources: extractSources(response),
    searched: searchItems.length > 0,
    searchQueries,
    searchCount: searchItems.length,
    costUsd: typeof totalCost === "number" ? totalCost : null,
  };
}
