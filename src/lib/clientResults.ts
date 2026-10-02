import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase(PostgREST)는 한 번에 최대 1000행까지만 돌려준다.
 * 같은 질문을 AI마다 여러 번 묻기 시작하면서 결과 행이 빠르게 늘어나므로,
 * 누적 집계는 반드시 이 함수로 페이지를 끝까지 넘겨 가며 읽는다.
 */
const PAGE_SIZE = 1000;

/** 집계에 필요한 가벼운 컬럼만. 원문 응답(raw_response)은 무거워서 빼 둔다. */
export const AGGREGATE_COLUMNS = "id, run_id, provider, mentioned, rank, competitors, sources, model, created_at";

export type AggregateRow = {
  id: string;
  run_id: string;
  provider: string;
  mentioned: boolean;
  rank: number | null;
  competitors: string[] | null;
  sources: { title: string; url: string }[] | null;
  model: string | null;
  created_at: string;
};

type PageQuery = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** range(from, to)를 받아 쿼리를 만드는 함수로 마지막 페이지까지 읽는다. 정렬은 쿼리 쪽에서 고정해야 한다. */
export async function fetchAllPages<T>(page: (from: number, to: number) => PageQuery): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

/** 한 클라이언트의 모든 모니터링 결과를 run을 통해 찾아 끝까지 읽는다. */
export function fetchClientResults<T = AggregateRow>(
  supabase: SupabaseClient,
  clientId: string,
  columns: string = AGGREGATE_COLUMNS
): Promise<T[]> {
  return fetchAllPages<T>((from, to) =>
    supabase
      .from("monitoring_results")
      .select(`${columns}, monitoring_runs!inner(client_id)`)
      .eq("monitoring_runs.client_id", clientId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
}
