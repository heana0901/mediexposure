// 1M 토큰당 가격(USD). 2026-07 기준 공개 가격을 참고한 값이며 실제 청구액과 다를 수 있습니다.
// 모델이 추가/변경되면 이 맵도 함께 업데이트해야 합니다.
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
};

export function estimateCostUsd(
  model: string | null,
  inputTokens: number | null,
  outputTokens: number | null
): number | null {
  if (!model) return null;
  const rate = PRICING_PER_MILLION_TOKENS[model];
  if (!rate) return null;

  const input = ((inputTokens ?? 0) / 1_000_000) * rate.input;
  const output = ((outputTokens ?? 0) / 1_000_000) * rate.output;
  return input + output;
}
