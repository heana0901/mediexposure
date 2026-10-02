/** 리포트(PDF·메일)가 같이 쓰는 문구와 표기 */

export const MEDICAL_AD_NOTE =
  "콘텐츠 처방은 의료법 제56조에 따라 치료 후기·전후 사진·최상급·비교·보장 표현을 빼고 만들었습니다. 게시 전 의료광고 심의 기준을 확인하세요.";

export const QUESTION_TABLE_NOTE =
  "최근 3회 실행 기준 · 검색량 많은 순 · 네이버 순위는 1~5위(플레이스)·1~10위(블로그·웹문서) 안일 때만 표시";

export const PLAN_NOTE = "검색량은 많은데 AI가 우리 병원을 잘 추천하지 않는 질문부터, AI 답변과 인용 출처를 근거로 만들었습니다.";

export const DEVELOPER_PDF_NOTE =
  "홈페이지 제작자에게 넘길 상세 요청서(예시 코드 포함)는 홈페이지 분석 탭에서 PDF로 받을 수 있습니다.";

export const NO_AUDIT_NOTE = "홈페이지 분석 기록이 없습니다. 홈페이지 분석 탭에서 한 번 분석하면 다음 리포트부터 들어갑니다.";

export function volumeLabel(q: { volume: number | null; volumeNote?: string | null }) {
  if (q.volumeNote) return q.volumeNote;
  return q.volume === null ? "-" : `${q.volume.toLocaleString()}회`;
}

export function rankLabel(n: number | null | undefined) {
  return n ? `${n}위` : "-";
}

export function scoreDelta(score: number, previous: number | null) {
  if (previous === null) return null;
  const diff = score - previous;
  return `지난 분석 ${previous}점 대비 ${diff >= 0 ? "+" : ""}${diff}점`;
}
