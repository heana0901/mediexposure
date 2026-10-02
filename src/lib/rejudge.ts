import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchClientResults } from "./clientResults";
import { judgeResponse } from "./nameMatch";

/**
 * 저장된 답변 원문을 지금의 판정 규칙으로 다시 매긴다.
 * AI를 다시 부르지 않고 원문 글자만 보므로 비용이 들지 않는다.
 * 별칭을 바꿨을 때, 그리고 판정 규칙을 고친 뒤 과거 기록을 바로잡을 때 쓴다.
 */
type StoredRow = {
  id: string;
  raw_response: string | null;
  competitors: string[] | null;
  mentioned: boolean;
  rank: number | null;
  evidence?: string | null;
};

export type RejudgeSummary = {
  checked: number;
  changed: number;
  mentionedBefore: number;
  mentionedAfter: number;
};

const UPDATE_BATCH = 20;

export async function rejudgeClient(
  supabase: SupabaseClient,
  client: { id: string; name: string; aliases?: unknown }
): Promise<RejudgeSummary> {
  const aliases = Array.isArray(client.aliases) ? client.aliases.filter((a): a is string => typeof a === "string") : [];

  let withEvidence = true;
  let rows: StoredRow[];
  try {
    rows = await fetchClientResults<StoredRow>(
      supabase,
      client.id,
      "id, raw_response, competitors, mentioned, rank, evidence, created_at"
    );
  } catch (err) {
    // 016 전이면 evidence 컬럼 없이 다시 읽는다
    if (!(err instanceof Error) || !err.message.includes("evidence")) throw err;
    withEvidence = false;
    rows = await fetchClientResults<StoredRow>(supabase, client.id, "id, raw_response, competitors, mentioned, rank, created_at");
  }

  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  let mentionedBefore = 0;
  let mentionedAfter = 0;

  for (const row of rows) {
    if (row.mentioned) mentionedBefore += 1;
    // 호출 실패로 저장된 옛 기록은 원문이 없으니 판정 대상이 아니다
    if (!row.raw_response || row.raw_response.startsWith("[오류]")) {
      if (row.mentioned) mentionedAfter += 1;
      continue;
    }

    const judged = judgeResponse(row.raw_response, client.name, aliases, row.competitors ?? []);
    if (judged.mentioned) mentionedAfter += 1;

    const patch: Record<string, unknown> = {};
    if (judged.mentioned !== row.mentioned) patch.mentioned = judged.mentioned;
    if (judged.rank !== row.rank) patch.rank = judged.rank;
    if (JSON.stringify(judged.competitors) !== JSON.stringify(row.competitors ?? [])) patch.competitors = judged.competitors;
    if (withEvidence && (judged.evidence ?? null) !== (row.evidence ?? null)) patch.evidence = judged.evidence;
    if (Object.keys(patch).length) updates.push({ id: row.id, patch });
  }

  for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
    const batch = updates.slice(i, i + UPDATE_BATCH);
    const results = await Promise.all(
      batch.map(({ id, patch }) => supabase.from("monitoring_results").update(patch).eq("id", id))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }

  return { checked: rows.length, changed: updates.length, mentionedBefore, mentionedAfter };
}
