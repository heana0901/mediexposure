/**
 * 홈페이지 진단 결과의 타입과 상수.
 *
 * 이 파일은 클라이언트 컴포넌트에서도 import합니다.
 * 그래서 node:dns 같은 서버 전용 모듈을 쓰는 diagnose.ts와 분리해 두었습니다.
 * (합쳐 두면 클라이언트 번들에 Node 내장 모듈이 딸려 들어가 빌드가 깨집니다)
 */

export type CheckStatus = "pass" | "warn" | "fail";

/**
 * 진단 축.
 * SEO는 검색엔진이 페이지를 읽는 기본기, AEO는 AI 답변에 인용될 준비도,
 * GEO는 이 사이트의 주체를 기계가 식별할 수 있는지, 네이버는 국내 검색 대응입니다.
 */
export type Axis = "seo" | "aeo" | "geo" | "naver";

export const AXIS_ORDER: Axis[] = ["seo", "aeo", "geo", "naver"];

export const AXIS_META: Record<
  Axis,
  { label: string; short: string; description: string; weight: number }
> = {
  seo: {
    label: "SEO 기술 최적화",
    short: "SEO",
    description: "검색엔진이 페이지를 제대로 읽을 수 있는 상태인지",
    weight: 40,
  },
  aeo: {
    label: "AEO AI 인용 준비도",
    short: "AEO",
    description: "생성형 AI가 답변에 인용할 수 있는 구조인지",
    weight: 20,
  },
  geo: {
    label: "GEO 엔티티 인식",
    short: "GEO",
    description: "이 사이트의 주체를 하나의 대상으로 식별할 수 있는지",
    weight: 20,
  },
  naver: {
    label: "네이버 대응",
    short: "네이버",
    description: "국내 고객이 가장 많이 쓰는 검색에 대응하고 있는지",
    weight: 20,
  },
};

export type Grade = "우수" | "양호" | "보통" | "개선 필요";

export type CheckResult = {
  id: string;
  axis: Axis;
  name: string;
  /** 검사 결과 요약 (실제 발견한 값) */
  detail: string;
  status: CheckStatus;
  /** 개선 방법. status가 pass면 비어 있습니다. */
  fix?: string;
  /** 축 내부 가중치 */
  weight: number;
};

export type AxisScore = {
  axis: Axis;
  score: number;
  passed: number;
  total: number;
};

export type SiteDiagnosis = {
  url: string;
  finalUrl: string;
  title: string;
  score: number;
  grade: Grade;
  responseMs: number;
  axes: AxisScore[];
  checks: CheckResult[];
  /** 우선순위 개선 항목 (최대 5개) */
  priorities: { name: string; fix: string; axis: Axis }[];
  /** 진단 자체가 불가능했던 경우의 사유 (주소 오류·접속 실패 등) */
  error?: string | null;
};

/** 2025년 이전 버전에서 저장된 기록의 체크 항목 형식 */
export type LegacyCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

export type LegacySite = {
  url: string;
  finalUrl: string;
  title: string;
  checks: LegacyCheck[];
};

export type SiteComparisonResult = {
  /** 2 = 25항목·100점 만점 진단. 없으면 구버전 기록입니다. */
  version?: 2;
  sites: (SiteDiagnosis | LegacySite)[];
  aiComment: string | null;
  /** AI 진단 코멘트를 만들지 못한 이유 (API 키·크레딧 문제 등) */
  aiCommentError?: string | null;
  checkedAt?: string;
};

export function gradeOf(score: number): Grade {
  if (score >= 85) return "우수";
  if (score >= 70) return "양호";
  if (score >= 50) return "보통";
  return "개선 필요";
}

/** 구버전 기록인지 판별합니다. */
export function isLegacySite(site: SiteDiagnosis | LegacySite): site is LegacySite {
  return !("score" in site) || !Array.isArray((site as SiteDiagnosis).axes);
}

export function scoreTone(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#2563eb";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}
