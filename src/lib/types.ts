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
  /** AI가 우리 병원을 부를 수 있는 다른 이름(약칭·영문명·지점명). 016 이전 데이터엔 없다 */
  aliases?: string[];
  /** 병원 네이버 블로그 주소 (017) */
  naver_blog_url?: string | null;
  /** 자동 모니터링 주기(일). 없으면 기본 주기(7일) (018) */
  monitor_interval_days?: number | null;
  /** 리포트에 넣을 항목 (019). 없으면 전부 */
  report_sections?: string[] | null;
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
  aliases?: string[];
  naver_blog_url?: string;
};

export type Keyword = {
  id: string;
  client_id: string;
  text: string;
  /** 같은 의도의 다른 표현. 반복 측정 때 회차마다 돌려 가며 묻는다 */
  variants?: string[];
  /** 지명이 여러 지역에 있을 때의 경고 */
  variant_note?: string | null;
  /** 네이버 대표 검색어와 월간 검색량 (017) */
  search_keyword?: string | null;
  search_volume?: number | null;
  search_volume_note?: string | null;
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
  /** 이 회차에 실제로 보낸 표현 (016 이전 데이터는 null → keyword_text와 같다) */
  query_text?: string | null;
  /** 우리 병원이 처음 언급된 문장 (판정 근거) */
  evidence?: string | null;
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
  /** 한 병원으로 합친 다른 표기들 */
  spellings?: string[];
  /** 건강보험심사평가원 병원정보로 확인한 결과. 확인하지 않았으면 없다 */
  registry?: { found: boolean; officialName: string | null; address: string | null } | null;
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

/** 노출 여부 외에 함께 보는 지표 */
export type VisibilityMetrics = {
  /** 답변에 나온 병원 언급 전체 중 우리 병원 비중 */
  shareOfVoice: ExposureTally;
  /** 전체 답변 중 우리 병원이 첫 번째로 추천된 비율 */
  firstPlace: ExposureTally;
  /** 출처가 있는 답변 중 우리 홈페이지가 인용된 비율 */
  ownCitation: ExposureTally;
};

export type UsageSummary = {
  /** 원화 환산에 쓴 환율(원/달러, 추정) */
  krwPerUsd: number;
  /** 이번 달 예상 비용의 계산 근거 */
  assumptions: {
    /** 병원별 주기를 정하지 않은 병원에 쓰는 기본 자동 실행 주기(일) */
    defaultIntervalDays: number;
    providers: Provider[];
    baseSamples: number;
  };
  /** AI별 질문 1회당 비용과 질문당 평균 반복 횟수. measured=false면 실측이 없어 추정값 */
  costPerCall: Partial<Record<Provider, { usd: number; samples: number; measured: boolean }>>;
  lastMonth: { label: string; runs: number; costUsd: number };
  thisMonth: { label: string; runs: number; costUsd: number; remainingRuns: number; projectedUsd: number };
  byClient: {
    clientId: string;
    clientName: string;
    keywords: number;
    /** 이 병원의 자동 실행 주기(일) */
    intervalDays: number;
    /** 지금 설정으로 한 번 실행할 때 예상 비용 */
    perRunUsd: number;
    lastMonthRuns: number;
    lastMonthUsd: number;
    thisMonthRuns: number;
    thisMonthUsd: number;
    remainingRuns: number;
    projectedUsd: number;
  }[];
};

/** 질문 하나에 대한 콘텐츠 처방: AI가 대신 추천한 곳과 이유, 근거로 읽은 페이지, 만들 페이지 설계서 */
export type ContentPrescription = {
  keywordId: string;
  question: string;
  /** 네이버 대표 검색어와 월간 검색량 */
  searchKeyword: string | null;
  volume: number | null;
  /** 최근 실행에서 우리 병원을 추천한 횟수 */
  tally: ExposureTally;
  /** AI가 대신 추천한 곳과, 답변 문장에 근거한 추천 이유 */
  competitors: { name: string; count: number; why: string }[];
  /** AI가 이 질문에 근거로 인용한 페이지 (우리 홈페이지 제외) */
  citedPages: { host: string; title: string | null; url: string | null; count: number }[];
  /** 우리 홈페이지가 출처로 인용된 답변 수 */
  ownCited: number;
  /** 우리 병원이 밀리는 이유 한 줄 */
  gap: string;
  /** 화면에 보여줄 한 줄 처방 */
  headline: string;
  /** 만들 페이지 설계서 */
  page: { title: string; slug: string; summary: string; faqs: string[]; mustHave: string[] };
  /** 의료광고 규정에 걸릴 수 있어 빼거나 확인이 필요한 표현 */
  cautions: string[];
};

export type ContentPlan = {
  generatedAt: string;
  /** 이 처방의 근거가 된 가장 최근 실행 */
  runId: string | null;
  items: ContentPrescription[];
  /** 처방할 질문이 없을 때 등의 안내 */
  note: string | null;
};

export type TrendPoint = {
  runId: string;
  createdAt: string;
  /** AI별 노출률(%). 그 실행에서 측정하지 않은 AI는 키가 없다. */
  rates: Partial<Record<Provider, number>>;
  /** AI별 노출 횟수/측정 횟수 (오차범위·유의성 계산용) */
  counts: Partial<Record<Provider, ExposureTally>>;
  overallRate: number | null;
  overall: ExposureTally;
  /** 측정 조건 요약 (질문 방식·모델·반복 횟수) */
  condition: string | null;
  /** 직전 실행과 측정 조건이 달라졌으면 true — 그래프에 표시해 수치 단절을 알린다 */
  conditionChanged: boolean;
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

/** 홈페이지 분석 한 번의 점수 기록 (점수 변화 추적용) */
export type SiteAuditHistoryEntry = {
  id: string;
  createdAt: string;
  url: string;
  score: number;
  grade: string;
  axes: { axis: "seo" | "aeo" | "geo" | "naver"; score: number }[];
  passed: number;
  total: number;
  checks: { id: string; name: string; status: "pass" | "warn" | "fail"; axis: "seo" | "aeo" | "geo" | "naver" }[];
};

/** 검색 수요(네이버 월간 검색량)를 반영한 AI 추천 확률 */
export type DemandSummary = {
  /** 네이버 검색광고 API 키가 설정돼 있는지 */
  configured: boolean;
  /** 검색량 가중 AI 추천 확률(%). 검색량을 아는 질문이 없으면 null */
  weightedRate: number | null;
  totalVolume: number;
  items: {
    keywordId: string;
    text: string;
    searchKeyword: string | null;
    volume: number | null;
    volumeNote: string | null;
    hits: number;
    total: number;
    rate: number | null;
  }[];
};

/** 질문 추천: 네이버 연관 키워드 */
export type KeywordIdea = {
  keyword: string;
  volume: number;
  approx: boolean;
  competition: string | null;
  /** 우리 병원 이름이 들어간 검색어 */
  brand: boolean;
  /** 경쟁 병원 이름이 들어간 검색어 */
  competitorBrand: string | null;
};

/** 한 번의 실행에서 같은 질문으로 본 네이버 노출 */
export type NaverResult = {
  id: string;
  run_id: string;
  keyword_id: string | null;
  search_keyword: string;
  local_rank: number | null;
  local_total: number;
  blog_rank: number | null;
  blog_own_count: number;
  blog_mention_count: number;
  blog_total: number;
  web_rank: number | null;
  web_total: number;
  top_local: { title: string; address: string; ours: boolean }[];
  top_blogs: { title: string; link: string; blogger: string; own: boolean; mentions: boolean }[];
  created_at: string;
};
