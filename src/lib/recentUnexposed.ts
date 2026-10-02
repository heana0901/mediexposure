import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 같은 날짜에 여러 번 실행됐으면 하루로 합쳐서, 최근 실행일 N개에 해당하는 run id를 반환 */
export async function getRecentRunIds(
  supabase: SupabaseClient,
  clientId: string,
  runsCount: number
): Promise<Set<string>> {
  const { data: runs } = await supabase
    .from("monitoring_runs")
    .select("id, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const dateToRunIds = new Map<string, string[]>();
  for (const run of runs ?? []) {
    const dateKey = (run.created_at as string).slice(0, 10);
    const list = dateToRunIds.get(dateKey) ?? [];
    list.push(run.id as string);
    dateToRunIds.set(dateKey, list);
  }

  const recentDates = Array.from(dateToRunIds.keys())
    .sort()
    .slice(-runsCount);

  return new Set(recentDates.flatMap((d) => dateToRunIds.get(d) ?? []));
}

type ResultLike = {
  keyword_id: string | null;
  provider: string;
  mentioned: boolean;
  created_at: string;
  run_id: string;
  competitors?: string[] | null;
  sample_index?: number | null;
};

/**
 * 최근 run id에 속한 결과 중, 같은 키워드+제공자 조합은 가장 최신 실행만 남기고
 * 그 실행에서 한 번도 노출되지 않은 것만 반환한다.
 *
 * 한 실행에서 같은 질문을 여러 번(샘플) 물었다면 샘플 중 한 번이라도 노출되면 미노출이 아니다.
 * 반환하는 행은 첫 샘플이고, 경쟁사 목록은 모든 샘플에서 나온 이름을 합친 것이다.
 */
export function dedupeUnexposed<T extends ResultLike>(results: T[], recentRunIds: Set<string>): T[] {
  const latestByKey = new Map<string, { runId: string; createdAt: number; rows: T[] }>();

  for (const r of results) {
    if (!recentRunIds.has(r.run_id)) continue;
    const key = `${r.keyword_id}_${r.provider}`;
    const createdAt = Date.parse(r.created_at);
    const current = latestByKey.get(key);

    if (current && current.runId === r.run_id) current.rows.push(r);
    else if (!current || createdAt > current.createdAt) {
      latestByKey.set(key, { runId: r.run_id, createdAt, rows: [r] });
    }
  }

  const unexposed: T[] = [];
  for (const { rows } of latestByKey.values()) {
    if (rows.some((r) => r.mentioned)) continue;
    const ordered = [...rows].sort((a, b) => (a.sample_index ?? 0) - (b.sample_index ?? 0));
    const competitors = [...new Set(ordered.flatMap((r) => r.competitors ?? []))];
    unexposed.push({ ...ordered[0], competitors });
  }
  return unexposed;
}
