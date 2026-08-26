import OpenAI from "openai";
import type { LocationHint } from "../location";
import { SEARCH_RETRY_NUDGE } from "./prompt";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type Source = { title: string; url: string };

export type AiCallResult = {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  sources: Source[];
  /** 이번 호출에서 실제로 웹 검색이 실행됐는지 */
  searched: boolean;
  /** 모델이 실행한 검색어 */
  searchQueries: string[];
};

export type AskOptions = {
  /** 답변 형식을 못박는 시스템 지침 */
  instructions?: string;
  location?: LocationHint | null;
};

/** 웹 검색을 건너뛰었을 때 재시도하는 최대 횟수(첫 호출 포함) */
const MAX_ATTEMPTS = 2;

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

  try {
    return await client.responses.create({ ...params, tool_choice: FORCE_WEB_SEARCH });
  } catch (err) {
    if (!isToolChoiceUnsupported(err)) throw err;
    return await client.responses.create(params);
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

function hasWebSearchCall(response: OpenAI.Responses.Response): boolean {
  return (response.output ?? []).some((item) => item.type === "web_search_call");
}

export async function askChatGPT(question: string, options: AskOptions = {}): Promise<AiCallResult> {
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let last: AiCallResult = {
    text: "",
    model,
    inputTokens: null,
    outputTokens: null,
    sources: [],
    searched: false,
    searchQueries: [],
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // 강제 지정에도 검색을 건너뛴 경우에만 검색을 한 번 더 채근한다.
    const input = attempt === 0 ? question : `${question}\n\n${SEARCH_RETRY_NUDGE}`;
    const response = await createResponse(model, input, options);

    // 재시도 비용까지 합산해야 실제 사용량과 맞는다.
    if (response.usage) {
      inputTokens = (inputTokens ?? 0) + response.usage.input_tokens;
      outputTokens = (outputTokens ?? 0) + response.usage.output_tokens;
    }

    const result: AiCallResult = {
      text: response.output_text ?? "",
      model,
      inputTokens,
      outputTokens,
      sources: extractSources(response),
      searched: hasWebSearchCall(response),
      searchQueries: extractSearchQueries(response),
    };

    if (result.searched) return result;
    last = result;
  }

  return last;
}
