// 1M 토큰당 가격(USD)과 웹검색 1회당 요금. 2026-10 기준 공개 가격을 참고한 값이며 실제 청구액과 다를 수 있습니다.
// 모델이 추가/변경되면 이 맵도 함께 업데이트해야 합니다. 표에 없는 모델은 비용을 비워 둡니다(null).
type Rate = { input: number; output: number; perSearch?: number };

const PRICING: Record<string, Rate> = {
  // OpenAI — 웹검색 도구 호출 요금이 따로 붙는다 (gpt-4o 계열 $25/1천 회, gpt-5 계열 $10/1천 회)
  "gpt-4o": { input: 2.5, output: 10, perSearch: 0.025 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, perSearch: 0.025 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, perSearch: 0.01 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25, perSearch: 0.01 },
  "gpt-5.5": { input: 5, output: 30, perSearch: 0.01 },

  // Gemini — Google 검색 그라운딩은 무료 한도(3.x 계열 월 5,000회, 2.5 Flash 하루 1,500회)가 있어 검색 요금은 넣지 않았다.
  // gemini-3.8-flash는 2027-01-01부터 단가가 두 배($1.50/$7.50)로 오른다.
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },

  // Perplexity Agent API — 웹검색 $2.50/1천 회
  "perplexity/sonar": { input: 0.25, output: 2.5, perSearch: 0.0025 },

  // Claude — 웹검색 $10/1천 회
  "claude-opus-5-5": { input: 4, output: 20, perSearch: 0.01 },
  "claude-sonnet-5-5": { input: 2, output: 10, perSearch: 0.01 },
  "claude-haiku-4-5": { input: 1, output: 5, perSearch: 0.01 },
};

export function estimateCostUsd(
  model: string | null,
  inputTokens: number | null,
  outputTokens: number | null,
  searchCount = 0
): number | null {
  if (!model) return null;
  const rate = PRICING[model];
  if (!rate) return null;

  const input = ((inputTokens ?? 0) / 1_000_000) * rate.input;
  const output = ((outputTokens ?? 0) / 1_000_000) * rate.output;
  const search = searchCount * (rate.perSearch ?? 0);
  return input + output + search;
}
