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

export type Provider = "chatgpt" | "gemini";

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

export type CompetitorFrequencyEntry = {
  name: string;
  chatgpt: number;
  gemini: number;
  total: number;
};

export type SourceFrequencyEntry = {
  domain: string;
  chatgpt: number;
  gemini: number;
  total: number;
};

export type SelfExposure = {
  count: number;
  total: number;
  chatgpt: { count: number; total: number };
  gemini: { count: number; total: number };
};

export type UsageSummary = {
  totalRuns: number;
  totalCostUsd: number;
  byClient: { clientId: string; clientName: string; runs: number; costUsd: number }[];
};

export type TrendPoint = {
  runId: string;
  createdAt: string;
  chatgptRate: number | null;
  geminiRate: number | null;
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
