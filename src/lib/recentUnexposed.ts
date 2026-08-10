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

type ResultLike = { keyword_id: string; provider: string; mentioned: boolean; created_at: string; run_id: string };

/** 최근 run id에 속한 결과 중, 같은 키워드+제공자 조합은 가장 최신 것만 남기고 미노출된 것만 반환 */
export function dedupeUnexposed<T extends ResultLike>(results: T[], recentRunIds: Set<string>): T[] {
  const candidates = results.filter((r) => recentRunIds.has(r.run_id));
  const latestByKey = new Map<string, T>();
  for (const r of candidates) {
    const key = `${r.keyword_id}_${r.provider}`;
    const existing = latestByKey.get(key);
    if (!existing || new Date(r.created_at) > new Date(existing.created_at)) {
      latestByKey.set(key, r);
    }
  }
  return Array.from(latestByKey.values()).filter((r) => !r.mentioned);
}
