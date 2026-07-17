import type {
  Client,
  ClientInput,
  Keyword,
  MonitoringRun,
  MonitoringResult,
  TrendPoint,
  UsageSummary,
} from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `요청 실패 (${res.status})`);
  }
  return res.json();
}

export const api = {
  listClients: () => fetch("/api/clients").then((r) => json<Client[]>(r)),

  createClient: (input: ClientInput) =>
    fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<Client>(r)),

  updateClient: (id: string, input: ClientInput) =>
    fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<Client>(r)),

  deleteClient: (id: string) =>
    fetch(`/api/clients/${id}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  listKeywords: (clientId: string) =>
    fetch(`/api/clients/${clientId}/keywords`).then((r) => json<Keyword[]>(r)),

  addKeyword: (clientId: string, text: string) =>
    fetch(`/api/clients/${clientId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => json<Keyword>(r)),

  deleteKeyword: (id: string) =>
    fetch(`/api/keywords/${id}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  runMonitoring: (clientId: string) =>
    fetch("/api/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    }).then((r) =>
      json<{ run: MonitoringRun; results: MonitoringResult[]; keywords: Keyword[] }>(r)
    ),

  listRuns: (clientId: string) =>
    fetch(`/api/runs?clientId=${clientId}`).then((r) => json<MonitoringRun[]>(r)),

  getRun: (runId: string) =>
    fetch(`/api/runs/${runId}`).then((r) =>
      json<{
        run: MonitoringRun;
        results: (MonitoringResult & { keywords: { text: string } })[];
      }>(r)
    ),

  getCompetitorAnalysis: (clientId: string) =>
    fetch(`/api/competitors?clientId=${clientId}`).then((r) =>
      json<{
        unexposed: (MonitoringResult & { keywords: { text: string } })[];
        competitorFrequency: { name: string; count: number }[];
        totalResults: number;
      }>(r)
    ),

  analyzeResult: (id: string) =>
    fetch(`/api/results/${id}/analyze`, { method: "POST" }).then((r) => json<MonitoringResult>(r)),

  getTrends: (clientId: string) =>
    fetch(`/api/trends?clientId=${clientId}`).then((r) => json<TrendPoint[]>(r)),

  getUsage: (clientId?: string) =>
    fetch(`/api/usage${clientId ? `?clientId=${clientId}` : ""}`).then((r) => json<UsageSummary>(r)),
};
