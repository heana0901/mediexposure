import OpenAI from "openai";
import type { LocationHint } from "../location";
import type { AiCallResult, AskOptions, Source } from "./types";
import { SEARCH_RETRY_NUDGE } from "./prompt";

export type { AiCallResult, AskOptions, Source } from "./types";

let client: OpenAI | null = null;

/** 키가 없는 환경에서도 이 파일을 import만 하는 건 문제없도록 처음 호출할 때 만든다. */
function getClient(): OpenAI {
  // 상위 모델은 분당 토큰 한도(429)에 걸리기 쉬워, 안내된 대기 시간 뒤 몇 번 더 시도한다
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 5 });
  return client;
}

/** 웹 검색을 건너뛰었을 때 재시도하는 최대 횟수(첫 호출 포함) */
const MAX_ATTEMPTS = 2;

/**
 * 기본 모델. 2026-10 비교 실험에서 로그인하지 않은 ChatGPT 화면(박진영병원 15회 중 7회 언급)과
 * 가장 가깝게 나온 조건이 gpt-5.5 + 검색 여부는 모델 판단(12회 중 5회)이었다.
 * gpt-5.4-mini는 0회, gpt-5.4는 2회로 병원 추천 대신 되묻는 답이 많았다.
 */
const DEFAULT_MODEL = "gpt-5.5";

/** 검색을 강제할지. 기본은 모델 판단(실제 ChatGPT와 같음). OPENAI_FORCE_SEARCH=1이면 강제 */
function shouldForceSearch(options: AskOptions): boolean {
  return options.forceSearch ?? process.env.OPENAI_FORCE_SEARCH === "1";
}

/** 웹 검색 도구를 반드시 한 번 이상 호출하게 강제한다. */
const FORCE_WEB_SEARCH: OpenAI.Responses.ToolChoiceAllowed = {
  type: "allowed_tools",
  mode: "required",
  tools: [{ type: "web_search" }],
};

function buildTools(location?: LocationHint | null): OpenAI.Responses.Tool[] {
  return [
    {
      type: "web_search",
      search_context_size: "high",
      ...(location?.city || location?.region
        ? {
            user_location: {
              type: "approximate" as const,
              country: "KR",
              ...(location.city ? { city: location.city } : {}),
              ...(location.region ? { region: location.region } : {}),
              timezone: "Asia/Seoul",
            },
          }
        : {}),
    },
  ];
}

/** tool_choice 강제를 지원하지 않는 모델/계정이면 강제 없이 한 번 더 시도한다. */
function isToolChoiceUnsupported(err: unknown): boolean {
  return (
    err instanceof OpenAI.APIError &&
    err.status === 400 &&
    /tool_choice|allowed_tools/i.test(err.message ?? "")
  );
}

async function createResponse(
  model: string,
  input: string,
  options: AskOptions
): Promise<OpenAI.Responses.Response> {
  const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model,
    input,
    tools: buildTools(options.location),
    ...(options.instructions ? { instructions: options.instructions } : {}),
  };

  const request = { signal: options.signal };
  if (!shouldForceSearch(options)) return await getClient().responses.create(params, request);

  try {
    return await getClient().responses.create({ ...params, tool_choice: FORCE_WEB_SEARCH }, request);
  } catch (err) {
    if (!isToolChoiceUnsupported(err)) throw err;
    return await getClient().responses.create(params, request);
  }
}

function extractSources(response: OpenAI.Responses.Response): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];

  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type !== "output_text") continue;
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === "url_citation" && !seen.has(annotation.url)) {
          seen.add(annotation.url);
          sources.push({ title: annotation.title || annotation.url, url: annotation.url });
        }
      }
    }
  }

  return sources;
}

function extractSearchQueries(response: OpenAI.Responses.Response): string[] {
  const queries = new Set<string>();

  for (const item of response.output ?? []) {
    if (item.type !== "web_search_call" || item.action.type !== "search") continue;
    for (const query of item.action.queries ?? []) queries.add(query);
    if (item.action.query) queries.add(item.action.query);
  }

  return Array.from(queries);
}

function countWebSearchCalls(response: OpenAI.Responses.Response): number {
  return (response.output ?? []).filter((item) => item.type === "web_search_call").length;
}

export async function askChatGPT(question: string, options: AskOptions = {}): Promise<AiCallResult> {
  const model = options.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  // 검색을 모델에 맡길 때는 검색하라고 채근하지 않는다(실제 ChatGPT처럼 검색 없이 답할 수도 있다)
  const maxAttempts = shouldForceSearch(options) ? MAX_ATTEMPTS : 1;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let searchCount = 0;
  let last: AiCallResult = {
    text: "",
    model,
    inputTokens: null,
    outputTokens: null,
    sources: [],
    searched: false,
    searchQueries: [],
    searchCount: 0,
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 강제 지정에도 검색을 건너뛴 경우에만 검색을 한 번 더 채근한다.
    const input = attempt === 0 ? question : `${question}\n\n${SEARCH_RETRY_NUDGE}`;
    const response = await createResponse(model, input, options);

    // 재시도 비용까지 합산해야 실제 사용량과 맞는다.
    if (response.usage) {
      inputTokens = (inputTokens ?? 0) + response.usage.input_tokens;
      outputTokens = (outputTokens ?? 0) + response.usage.output_tokens;
    }

    const searches = countWebSearchCalls(response);
    searchCount += searches;

    const result: AiCallResult = {
      text: response.output_text ?? "",
      model,
      inputTokens,
      outputTokens,
      sources: extractSources(response),
      searched: searches > 0,
      searchQueries: extractSearchQueries(response),
      searchCount,
    };

    if (result.searched) return result;
    last = result;
  }

  return last;
}
