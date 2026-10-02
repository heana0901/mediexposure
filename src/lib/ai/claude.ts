import Anthropic from "@anthropic-ai/sdk";
import type { LocationHint } from "../location";
import type { AiCallResult, AskOptions, Source } from "./types";
import { SEARCH_RETRY_NUDGE } from "./prompt";

let client: Anthropic | null = null;

/** ANTHROPIC_API_KEY가 없는 환경에서도 import만 하는 건 문제없도록 처음 호출할 때 만든다. */
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** 웹 검색을 건너뛰었을 때 재시도하는 최대 횟수(첫 호출 포함) */
const MAX_ATTEMPTS = 2;

/** 서버 쪽 검색 루프가 길어져 pause_turn으로 멈추면 이어서 받는 최대 횟수 */
const MAX_CONTINUATIONS = 3;

type Message = Anthropic.Beta.Messages.BetaMessage;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

function userLocation(location?: LocationHint | null) {
  return {
    type: "approximate" as const,
    country: "KR",
    timezone: "Asia/Seoul",
    ...(location?.city ? { city: location.city } : {}),
    ...(location?.region ? { region: location.region } : {}),
  };
}

/**
 * Haiku는 동적 필터링 검색(web_search_20260209)·effort·fallbacks를 지원하지 않아
 * 기본 검색 도구만 붙인다. 기본값(Opus 5.5)과 Sonnet 5.x는 최신 경로를 쓴다.
 */
function isBasicModel(model: string): boolean {
  return model.includes("haiku");
}

async function createMessage(model: string, messages: MessageParam[], options: AskOptions): Promise<Message> {
  const location = userLocation(options.location);
  const system = options.instructions;

  if (isBasicModel(model)) {
    return getClient().beta.messages.create({
      model,
      max_tokens: 16000,
      ...(system ? { system } : {}),
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5, user_location: location }],
    });
  }

  return getClient().beta.messages.create({
    model,
    max_tokens: 16000,
    ...(system ? { system } : {}),
    messages,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5, user_location: location }],
    // 검색해서 상호명을 나열하는 단순 작업이라 낮은 effort로 충분하고, 실행 시간도 크게 줄어든다.
    output_config: { effort: "low" },
    // 안전 분류기가 거절하면 서버가 권장 모델로 같은 요청을 다시 돌린다.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
}

function extractText(message: Message): string {
  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}

function extractSources(message: Message): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];

  for (const block of message.content) {
    if (block.type !== "text") continue;
    for (const citation of block.citations ?? []) {
      if (citation.type !== "web_search_result_location" || seen.has(citation.url)) continue;
      seen.add(citation.url);
      sources.push({ title: citation.title || citation.url, url: citation.url });
    }
  }

  return sources;
}

function extractSearchQueries(message: Message): string[] {
  const queries = new Set<string>();
  for (const block of message.content) {
    if (block.type !== "server_tool_use" || block.name !== "web_search") continue;
    const query = (block.input as { query?: unknown } | null)?.query;
    if (typeof query === "string" && query.trim()) queries.add(query.trim());
  }
  return Array.from(queries);
}

/** pause_turn이면 멈춘 지점부터 이어 받아 하나의 답변으로 합친다. */
async function runTurn(model: string, question: string, options: AskOptions) {
  let messages: MessageParam[] = [{ role: "user", content: question }];
  const parts: Message[] = [];

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const message = await createMessage(model, messages, options);
    parts.push(message);

    if (message.stop_reason === "refusal") {
      throw new Error("Claude가 이 질문에 답변을 거절했습니다(refusal).");
    }
    if (message.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: message.content }];
  }

  return parts;
}

export async function askClaude(question: string, options: AskOptions = {}): Promise<AiCallResult> {
  const model = process.env.CLAUDE_MODEL || "claude-opus-5-5";
  let inputTokens = 0;
  let outputTokens = 0;
  let searchCount = 0;
  let last: AiCallResult | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Claude는 검색 도구 강제 지정(tool_choice)을 받지 않으므로, 검색을 건너뛰면 한 번 더 채근한다.
    const input = attempt === 0 ? question : `${question}\n\n${SEARCH_RETRY_NUDGE}`;
    const parts = await runTurn(model, input, options);

    // 이어 받은 응답과 재시도 비용까지 합산해야 실제 사용량과 맞는다.
    for (const part of parts) {
      inputTokens += part.usage.input_tokens + (part.usage.cache_read_input_tokens ?? 0);
      outputTokens += part.usage.output_tokens;
      searchCount += part.usage.server_tool_use?.web_search_requests ?? 0;
    }

    const searchQueries = parts.flatMap(extractSearchQueries);
    const searched =
      searchQueries.length > 0 ||
      parts.some((p) => (p.usage.server_tool_use?.web_search_requests ?? 0) > 0);

    last = {
      // pause_turn으로 이어 받았으면 답변이 여러 응답에 나뉘어 온다
      text: parts.map(extractText).filter(Boolean).join("\n"),
      model,
      inputTokens,
      outputTokens,
      sources: parts.flatMap(extractSources),
      searched,
      searchQueries: [...new Set(searchQueries)],
      searchCount,
    };

    if (searched) return last;
  }

  return last!;
}
