import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  const supabase = getSupabaseServerClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: clients, error: clientsError } = await supabase.from("clients").select("id, name");
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });

  let keywordsQuery = supabase.from("keywords").select("id, client_id");
  if (clientId) keywordsQuery = keywordsQuery.eq("client_id", clientId);
  const { data: keywords, error: keywordsError } = await keywordsQuery;
  if (keywordsError) return NextResponse.json({ error: keywordsError.message }, { status: 500 });

  const keywordToClient = new Map((keywords ?? []).map((k) => [k.id, k.client_id]));
  const keywordIds = (keywords ?? []).map((k) => k.id);

  if (keywordIds.length === 0) {
    return NextResponse.json({ totalRuns: 0, totalCostUsd: 0, byClient: [] });
  }

  const { data: results, error: resultsError } = await supabase
    .from("monitoring_results")
    .select("run_id, keyword_id, estimated_cost_usd, created_at")
    .in("keyword_id", keywordIds)
    .gte("created_at", monthStart);

  if (resultsError) return NextResponse.json({ error: resultsError.message }, { status: 500 });

  const clientNameMap = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const byClientMap = new Map<string, { runIds: Set<string>; costUsd: number }>();

  for (const r of results ?? []) {
    const cid = keywordToClient.get(r.keyword_id);
    if (!cid) continue;
    const entry = byClientMap.get(cid) ?? { runIds: new Set<string>(), costUsd: 0 };
    entry.runIds.add(r.run_id);
    entry.costUsd += (r.estimated_cost_usd as number | null) ?? 0;
    byClientMap.set(cid, entry);
  }

  const byClient = Array.from(byClientMap.entries())
    .map(([id, v]) => ({
      clientId: id,
      clientName: clientNameMap.get(id) ?? "(삭제된 클라이언트)",
      runs: v.runIds.size,
      costUsd: Math.round(v.costUsd * 10000) / 10000,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const totalRuns = byClient.reduce((sum, c) => sum + c.runs, 0);
  const totalCostUsd = Math.round(byClient.reduce((sum, c) => sum + c.costUsd, 0) * 10000) / 10000;

  return NextResponse.json({ totalRuns, totalCostUsd, byClient });
}
