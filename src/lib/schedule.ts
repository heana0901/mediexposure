/** 자동 모니터링 기본 주기(일). 병원별 주기를 정하지 않은 클라이언트에 쓴다 */
export const DEFAULT_INTERVAL_DAYS = 7;

/** 병원별 주기로 고를 수 있는 값(일) */
export const INTERVAL_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 30] as const;

/**
 * 기본 자동 모니터링 주기(일). MONITOR_INTERVAL_DAYS로 바꿀 수 있고, 비어 있거나 잘못된 값이면 7일.
 * cron은 매일 깨우고, 마지막 실행 후 이 주기가 지난 클라이언트만 다시 돌린다.
 */
export function getIntervalDays(): number {
  const days = Number(process.env.MONITOR_INTERVAL_DAYS);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_INTERVAL_DAYS;
}

/** 클라이언트의 자동 모니터링 주기(일): 계정 관리에서 정한 병원별 주기, 없으면 기본 주기 */
export function clientIntervalDays(client: { monitor_interval_days?: number | null }): number {
  const days = client.monitor_interval_days;
  return typeof days === "number" && days > 0 ? days : getIntervalDays();
}

/**
 * 마지막 실행이 이 시간보다 오래됐으면 다시 돌린다.
 * 정확히 주기만큼으로 두면 cron 시각이 몇 초만 앞당겨져도 하루를 통째로 거르므로
 * 반나절(12시간)의 여유를 둔다. 7일 주기면 156시간이 기준이다.
 */
export function minRunGapMs(intervalDays: number): number {
  return Math.max(intervalDays * 24 - 12, 1) * 60 * 60 * 1000;
}

/** "7일" → "매주", "14일" → "2주마다"처럼 읽기 쉬운 주기 이름 */
export function intervalLabel(days: number): string {
  if (days === 1) return "매일";
  if (days % 7 === 0) return days === 7 ? "매주" : `${days / 7}주마다`;
  return `${days}일마다`;
}
