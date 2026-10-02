import type { Provider } from "./providers";

export type { Provider } from "./providers";

export type ClientType = "hospital" | "business";

export type Client = {
  id: string;
  name: string;
  client_type: ClientType;
  region: string | null;
  department: string | null;
  director_name: string | null;
  is_specialist: boolean | null;
  contact_email: string | null;
  website_url: string | null;
  auto_report_enabled: boolean;
  auto_report_day: number | null;
  created_at: string;
};

export type ClientInput = {
  name: string;
  client_type?: ClientType;
  region?: string;
  department?: string;
  director_name?: string;
  is_specialist?: boolean | null;
  contact_email?: string;
  website_url?: string;
};

export type Keyword = {
  id: string;
  client_id: string;
  text: string;
  created_at: string;
};

export type Source = { title: string; url: string };

export type MonitoringResult = {
  id: string;
  run_id: string;
  keyword_id: string | null;
  /** 질문이 지워져도 남는 질문 문구 사본 (013 마이그레이션) */
  keyword_text: string | null;
  provider: Provider;
  mentioned: boolean;
  rank: number | null;
  raw_response: string;
  competitors: string[];
  analysis_note: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  sources: Source[];
  /** AI가 실제로 웹 검색을 수행했는지(마이그레이션 이전 데이터는 null) */
  searched: boolean | null;
  search_queries: string[];
  /** 같은 질문을 같은 AI에 반복해서 물은 회차(0부터). 014 마이그레이션 이전 데이터는 null */
  sample_index: number | null;
  created_at: string;
};

/** 결과 + 질문 조인. 질문이 지워졌으면 조인이 비므로 사본을 쓴다. */
export type ResultWithKeyword = MonitoringResult & { keywords: { text: string } | null };

/** 화면에 보여줄 질문 문구. 조인 → 사본 순으로 찾는다. */
export function keywordTextOf(result: {
  keywords?: { text: string } | null;
  keyword_text?: string | null;
}): string {
  return result.keywords?.text ?? result.keyword_text ?? "(지워진 질문)";
}

export type MonitoringRun = {
  id: string;
  client_id: string;
  created_at: string;
};

/** AI별 횟수. 측정하지 않은 AI는 키가 없다. */
export type ProviderCounts = Partial<Record<Provider, number>>;

export type CompetitorFrequencyEntry = {
  name: string;
  counts: ProviderCounts;
  total: number;
};

export type SourceFrequencyEntry = {
  domain: string;
  counts: ProviderCounts;
  total: number;
};

export type ExposureTally = { count: number; total: number };

export type SelfExposure = ExposureTally & {
  byProvider: Partial<Record<Provider, ExposureTally>>;
};

export type UsageSummary = {
  totalRuns: number;
  totalCostUsd: number;
  byClient: { clientId: string; clientName: string; runs: number; costUsd: number }[];
};

export type TrendPoint = {
  runId: string;
  createdAt: string;
  /** AI별 노출률(%). 그 실행에서 측정하지 않은 AI는 키가 없다. */
  rates: Partial<Record<Provider, number>>;
  overallRate: number | null;
};

export type AppUser = {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  clients: { id: string; name: string }[];
};

export type AppUserInput = {
  username: string;
  password: string;
  isAdmin: boolean;
  clientIds: string[];
};

/** 사람이 실제 AI 앱에서 검색해 붙여넣은 답변 (015 마이그레이션) */
export type ManualCheck = {
  id: string;
  client_id: string;
  keyword_id: string | null;
  keyword_text: string;
  provider: Provider;
  raw_response: string;
  mentioned: boolean;
  rank: number | null;
  competitors: string[];
  checked_at: string;
  created_by: string | null;
  created_at: string;
};

/** 같은 질문·같은 AI에 대해 실제 화면 기록과 가장 가까운 시점의 API 측정 */
export type ApiMeasurement = {
  runId: string;
  runAt: string;
  samples: number;
  hits: number;
  /** 노출 확률(%) */
  rate: number;
  avgRank: number | null;
};

export type ManualCheckWithComparison = ManualCheck & {
  api: ApiMeasurement | null;
  /** API가 '노출'(확률 50% 이상)로 본 것과 실제 화면이 같은지. 비교할 측정이 없으면 null */
  agrees: boolean | null;
};

export type ManualCheckSummary = {
  comparable: number;
  matches: number;
  byProvider: Partial<Record<Provider, { comparable: number; matches: number }>>;
};

export type ManualChecksResponse = {
  checks: ManualCheckWithComparison[];
  summary: ManualCheckSummary;
  /** 015 마이그레이션 전이라 표가 없으면 true */
  setupRequired?: boolean;
};
