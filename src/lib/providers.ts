/**
 * 모니터링 대상 AI 목록. 화면·리포트·이메일·집계가 모두 이 순서와 색을 따른다.
 *
 * 새 AI를 붙일 때는 여기에 한 줄 추가하고, src/lib/ai/registry.ts에 호출 함수를 등록하고,
 * DB의 provider check 제약(supabase/migrations)도 함께 넓혀야 한다.
 */
export const PROVIDERS = ["chatgpt", "gemini", "perplexity", "claude"] as const;

export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_META: Record<Provider, { label: string; color: string; bg: string }> = {
  chatgpt: { label: "ChatGPT", color: "#2a78d6", bg: "#eaf2fc" },
  gemini: { label: "Gemini", color: "#1baf7a", bg: "#e8f8f1" },
  perplexity: { label: "Perplexity", color: "#7c5cd6", bg: "#f1edfb" },
  claude: { label: "Claude", color: "#d97757", bg: "#fbefe9" },
};

export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

export function providerLabel(provider: string): string {
  return isProvider(provider) ? PROVIDER_META[provider].label : provider;
}

/** 결과에 실제로 등장한 AI만 표준 순서대로 돌려준다. 측정하지 않은 AI는 화면에 빈 칸으로 띄우지 않는다. */
export function providersIn(items: Iterable<{ provider: string }>): Provider[] {
  const seen = new Set<string>();
  for (const item of items) seen.add(item.provider);
  return PROVIDERS.filter((p) => seen.has(p));
}

/** Partial<Record<Provider, …>>의 키를 표준 순서대로 돌려준다. */
export function providerKeys(record: Partial<Record<Provider, unknown>>): Provider[] {
  return PROVIDERS.filter((p) => record[p] !== undefined);
}
