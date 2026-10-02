import "server-only";
import { PROVIDERS, isProvider, type Provider } from "../providers";
import { askChatGPT } from "./chatgpt";
import { askGemini } from "./gemini";
import { askPerplexity } from "./perplexity";
import { askClaude } from "./claude";
import type { AskFn } from "./types";

/** 각 AI의 호출 함수와, 호출에 필요한 API 키 환경변수 */
const REGISTRY: Record<Provider, { ask: AskFn; envKey: string }> = {
  chatgpt: { ask: askChatGPT, envKey: "OPENAI_API_KEY" },
  gemini: { ask: askGemini, envKey: "GEMINI_API_KEY" },
  perplexity: { ask: askPerplexity, envKey: "PERPLEXITY_API_KEY" },
  claude: { ask: askClaude, envKey: "ANTHROPIC_API_KEY" },
};

export function askProvider(provider: Provider): AskFn {
  return REGISTRY[provider].ask;
}

/**
 * 이번 모니터링에서 물어볼 AI 목록.
 *
 * API 키가 설정된 AI만 자동으로 켜진다. 키는 있지만 잠시 끄고 싶으면
 * MONITOR_PROVIDERS=chatgpt,gemini 처럼 쉼표로 골라 적는다.
 */
export function getActiveProviders(): Provider[] {
  const configured = PROVIDERS.filter((p) => Boolean(process.env[REGISTRY[p].envKey]?.trim()));

  const allowList = (process.env.MONITOR_PROVIDERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(isProvider);

  return allowList.length ? configured.filter((p) => allowList.includes(p)) : configured;
}

/** 같은 질문을 같은 AI에 몇 번 물을지. AI 답변은 매번 달라지므로 여러 번 물어 노출 확률로 본다. */
export function getSampleCount(): number {
  const raw = Number(process.env.MONITOR_SAMPLES ?? 3);
  if (!Number.isFinite(raw)) return 3;
  return Math.min(5, Math.max(1, Math.round(raw)));
}

/** AI별 동시 호출 수. 너무 높으면 제공자 쪽 분당 호출 한도(429)에 걸린다. */
export function getConcurrency(): number {
  const raw = Number(process.env.MONITOR_CONCURRENCY ?? 6);
  if (!Number.isFinite(raw)) return 6;
  return Math.min(20, Math.max(1, Math.round(raw)));
}
