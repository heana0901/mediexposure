/**
 * 병원 별칭 입력을 정리한다. 배열이나 쉼표로 구분한 문자열을 받는다.
 * 값이 아예 없으면 undefined(= 바꾸지 않음), 빈 값이면 [](= 모두 지움).
 */
export function parseAliases(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const cleaned = list
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, 50))
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, 10);
}
