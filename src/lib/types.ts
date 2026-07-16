export type Client = {
  id: string;
  name: string;
  created_at: string;
};

export type Keyword = {
  id: string;
  client_id: string;
  text: string;
  created_at: string;
};

export type Provider = "chatgpt" | "gemini";

export type MonitoringResult = {
  id: string;
  run_id: string;
  keyword_id: string;
  provider: Provider;
  mentioned: boolean;
  rank: number | null;
  raw_response: string;
  competitors: string[];
  created_at: string;
};

export type MonitoringRun = {
  id: string;
  client_id: string;
  created_at: string;
};
