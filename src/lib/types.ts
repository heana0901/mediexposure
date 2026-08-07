export type Client = {
  id: string;
  name: string;
  region: string | null;
  department: string | null;
  director_name: string | null;
  is_specialist: boolean | null;
  created_at: string;
};

export type ClientInput = {
  name: string;
  region?: string;
  department?: string;
  director_name?: string;
  is_specialist?: boolean | null;
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
  keyword_id: string;
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
  created_at: string;
};

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
