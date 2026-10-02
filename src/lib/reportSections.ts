/** 리포트에 넣을 수 있는 항목. 계정 관리에서 병원마다 고른다 */
export const REPORT_SECTIONS = [
  { key: "exposure", label: "AI 노출현황", detail: "AI 추천 확률 · 질문별 현황(검색량 · 네이버 순위)" },
  { key: "competitors", label: "경쟁분석", detail: "경쟁병원 TOP 5 · 콘텐츠 처방" },
  { key: "trends", label: "추이분석", detail: "노출률 추이" },
  { key: "site", label: "홈페이지", detail: "AI 친화 점수 · 먼저 고칠 것" },
] as const;

export type ReportSection = (typeof REPORT_SECTIONS)[number]["key"];

export const ALL_REPORT_SECTIONS: ReportSection[] = REPORT_SECTIONS.map((s) => s.key);

/** 저장된 값에서 아는 항목만 남긴다. 저장된 적이 없으면 전부 */
export function parseReportSections(value: unknown): ReportSection[] {
  if (!Array.isArray(value)) return ALL_REPORT_SECTIONS;
  return ALL_REPORT_SECTIONS.filter((key) => value.includes(key));
}
