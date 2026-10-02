/**
 * 노출 확률의 오차범위와 변화의 유의성.
 *
 * AI 답변은 같은 질문에도 매번 달라서(연속 실행의 17%에서 노출↔미노출이 뒤집혔다)
 * 숫자 하나만 보여주면 우연한 등락을 실제 변화로 오해하기 쉽다.
 */

/** 95% 윌슨 신뢰구간(%) — 표본이 적거나 0%·100% 근처에서도 무너지지 않는 방식 */
export function wilson(hits: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, (center - half) * 100), high: Math.min(1, center + half) * 100 };
}

/** 오차범위(±%p). 신뢰구간 폭의 절반을 반올림해서 보여준다. */
export function marginOfError(hits: number, n: number): number | null {
  const ci = wilson(hits, n);
  return ci ? Math.round((ci.high - ci.low) / 2) : null;
}

/** 이 정도 표본 미만이면 숫자 옆에 '표본 부족'을 함께 보여준다 */
export const MIN_RELIABLE_SAMPLES = 10;

/**
 * 두 기간의 노출률 차이가 우연으로 보기 어려운지(95%, 두 비율 z-검정).
 * 1이면 의미 있게 올랐고, -1이면 의미 있게 내렸고, 0이면 우연 범위다.
 */
export function significantChange(h1: number, n1: number, h2: number, n2: number): -1 | 0 | 1 {
  if (n1 < 5 || n2 < 5) return 0;
  const p1 = h1 / n1;
  const p2 = h2 / n2;
  const pooled = (h1 + h2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  const z = (p2 - p1) / se;
  if (z > 1.96) return 1;
  if (z < -1.96) return -1;
  return 0;
}

export function percent(hits: number, n: number): number | null {
  return n === 0 ? null : Math.round((hits / n) * 100);
}
