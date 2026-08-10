import type {
  Client,
  ClientInput,
  Keyword,
  MonitoringRun,
  MonitoringResult,
  TrendPoint,
  UsageSummary,
  SelfExposure,
  CompetitorFrequencyEntry,
  SourceFrequencyEntry,
  AppUser,
  AppUserInput,
} from "./types";
import type { ClientReportData } from "./reportData";
import type { SiteComparisonResult } from "./siteAudit";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `요청 실패 (${res.status})`);
  }
  return res.json();
}

export const api = {
  getMe: () => fetch("/api/auth/me").then((r) => json<{ username: string; isAdmin: boolean }>(r)),

  logout: () => fetch("/api/auth/logout", { method: "POST" }).then((r) => json<{ ok: true }>(r)),

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

  addKeywordsBulk: (clientId: string, texts: string[]) =>
    fetch(`/api/clients/${clientId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    }).then((r) => json<Keyword[]>(r)),

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
        competitorFrequency: CompetitorFrequencyEntry[];
        sourceFrequency: SourceFrequencyEntry[];
        totalResults: number;
        selfExposure: SelfExposure;
      }>(r)
    ),

  analyzeResult: (id: string) =>
    fetch(`/api/results/${id}/analyze`, { method: "POST" }).then((r) => json<MonitoringResult>(r)),

  getContentSuggestions: (clientId: string) =>
    fetch(`/api/clients/${clientId}/content-suggestions`, { method: "POST" }).then((r) =>
      json<{ suggestions: string }>(r)
    ),

  getTrends: (clientId: string) =>
    fetch(`/api/trends?clientId=${clientId}`).then((r) => json<TrendPoint[]>(r)),

  getUsage: (clientId?: string) =>
    fetch(`/api/usage${clientId ? `?clientId=${clientId}` : ""}`).then((r) => json<UsageSummary>(r)),

  listUsers: () => fetch("/api/admin/users").then((r) => json<AppUser[]>(r)),

  createUser: (input: AppUserInput) =>
    fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ id: string; username: string; isAdmin: boolean }>(r)),

  deleteUser: (id: string) =>
    fetch(`/api/admin/users/${id}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  updateUserClients: (id: string, clientIds: string[]) =>
    fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientIds }),
    }).then((r) => json<{ ok: true }>(r)),

  sendReport: (clientId: string) =>
    fetch("/api/reports/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    }).then((r) => json<{ ok: true; sentTo: string }>(r)),

  getReportData: (clientId: string) =>
    fetch(`/api/reports/data?clientId=${clientId}`).then((r) => json<ClientReportData>(r)),

  updateAutoReport: (clientId: string, enabled: boolean, day: number | null) =>
    fetch(`/api/clients/${clientId}/auto-report`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, day }),
    }).then((r) => json<{ id: string; auto_report_enabled: boolean; auto_report_day: number | null }>(r)),

  runSiteAudit: (urls: string[]) =>
    fetch("/api/site-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    }).then((r) => json<SiteComparisonResult>(r)),
};
