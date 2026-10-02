import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";
import { rate, ratesByProvider } from "@/lib/aggregate";
import { fetchClientResults } from "@/lib/clientResults";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });
  }

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();

  const { data: runs, error: runsError } = await supabase
    .from("monitoring_runs")
    .select("id, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (runsError) {
    return NextResponse.json({ error: runsError.message }, { status: 500 });
  }

  if ((runs ?? []).length === 0) {
    return NextResponse.json([]);
  }

  let results: { run_id: string; provider: string; mentioned: boolean }[];
  try {
    results = await fetchClientResults(supabase, clientId, "id, run_id, provider, mentioned, created_at");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const resultsByRun = new Map<string, typeof results>();
  for (const r of results) {
    const list = resultsByRun.get(r.run_id) ?? [];
    list.push(r);
    resultsByRun.set(r.run_id, list);
  }

  const trends = (runs ?? []).map((run) => {
    const runResults = resultsByRun.get(run.id) ?? [];
    return {
      runId: run.id,
      createdAt: run.created_at,
      rates: ratesByProvider(runResults),
      overallRate: rate(runResults),
    };
  });

  return NextResponse.json(trends);
}
