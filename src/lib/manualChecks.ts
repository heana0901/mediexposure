import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchClientResults } from "./clientResults";
import { PROVIDERS, type Provider } from "./providers";
import type {
  ApiMeasurement,
  ManualCheck,
  ManualCheckSummary,
  ManualCheckWithComparison,
  ManualChecksResponse,
} from "./types";

/** 실제 화면 기록과 이 기간 안에 실행된 API 측정만 비교 대상으로 삼는다 */
const MAX_GAP_MS = 7 * 24 * 60 * 60 * 1000;

/** API가 '노출'로 판단하는 기준. 여러 번 물어 절반 이상 나오면 노출로 본다. */
const EXPOSED_RATE = 50;

type ApiRow = {
  run_id: string;
  keyword_id: string | null;
  provider: string;
  mentioned: boolean;
  rank: number | null;
  created_at: string;
};

type RunGroup = { runId: string; runAt: number; rows: ApiRow[] };

/** 표가 아직 없을 때(015 전) Supabase가 돌려주는 오류인지 */
export function isMissingTable(message: string): boolean {
  return message.includes("manual_checks") && /does not exist|schema cache|Could not find/i.test(message);
}

function measure(group: RunGroup): ApiMeasurement {
  const hits = group.rows.filter((r) => r.mentioned).length;
  const ranks = group.rows.filter((r) => r.mentioned && r.rank).map((r) => r.rank as number);
  return {
    runId: group.runId,
    runAt: new Date(group.runAt).toISOString(),
    samples: group.rows.length,
    hits,
    rate: Math.round((hits / group.rows.length) * 100),
    avgRank: ranks.length ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : null,
  };
}

export async function getManualChecks(supabase: SupabaseClient, clientId: string): Promise<ManualChecksResponse> {
  const empty: ManualCheckSummary = { comparable: 0, matches: 0, byProvider: {} };

  const { data, error } = await supabase
    .from("manual_checks")
    .select("*")
    .eq("client_id", clientId)
    .order("checked_at", { ascending: false });

  if (error) {
    if (isMissingTable(error.message)) return { checks: [], summary: empty, setupRequired: true };
    throw new Error(error.message);
  }

  const checks = (data ?? []) as ManualCheck[];
  if (checks.length === 0) return { checks: [], summary: empty };

  // 질문+AI별로 API 실행(run) 묶음을 만들어 둔다
  const apiRows = await fetchClientResults<ApiRow>(
    supabase,
    clientId,
    "id, run_id, keyword_id, provider, mentioned, rank, created_at"
  );
  const groups = new Map<string, Map<string, RunGroup>>();
  for (const row of apiRows) {
    if (!row.keyword_id) continue;
    const key = `${row.keyword_id}|${row.provider}`;
    const runs = groups.get(key) ?? new Map<string, RunGroup>();
    const group = runs.get(row.run_id) ?? { runId: row.run_id, runAt: Date.parse(row.created_at), rows: [] };
    group.rows.push(row);
    runs.set(row.run_id, group);
    groups.set(key, runs);
  }

  const summary: ManualCheckSummary = { comparable: 0, matches: 0, byProvider: {} };

  const withComparison: ManualCheckWithComparison[] = checks.map((check) => {
    const checkedAt = Date.parse(check.checked_at);
    const runs = check.keyword_id ? groups.get(`${check.keyword_id}|${check.provider}`) : undefined;

    // 실제 화면을 확인한 시각과 가장 가까운 API 실행
    let nearest: RunGroup | null = null;
    for (const group of runs?.values() ?? []) {
      const gap = Math.abs(group.runAt - checkedAt);
      if (gap > MAX_GAP_MS) continue;
      if (!nearest || gap < Math.abs(nearest.runAt - checkedAt)) nearest = group;
    }

    if (!nearest) return { ...check, api: null, agrees: null };

    const api = measure(nearest);
    const agrees = check.mentioned === api.rate >= EXPOSED_RATE;

    summary.comparable += 1;
    if (agrees) summary.matches += 1;
    const tally = summary.byProvider[check.provider] ?? { comparable: 0, matches: 0 };
    tally.comparable += 1;
    if (agrees) tally.matches += 1;
    summary.byProvider[check.provider] = tally;

    return { ...check, api, agrees };
  });

  return { checks: withComparison, summary };
}

export function parseProvider(value: unknown): Provider | null {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value) ? (value as Provider) : null;
}
