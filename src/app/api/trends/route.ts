import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";

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

  const runIds = (runs ?? []).map((r) => r.id);
  if (runIds.length === 0) {
    return NextResponse.json([]);
  }

  const { data: results, error: resultsError } = await supabase
    .from("monitoring_results")
    .select("run_id, provider, mentioned")
    .in("run_id", runIds);

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  const trends = (runs ?? []).map((run) => {
    const runResults = (results ?? []).filter((r) => r.run_id === run.id);
    const chatgptResults = runResults.filter((r) => r.provider === "chatgpt");
    const geminiResults = runResults.filter((r) => r.provider === "gemini");

    const rate = (list: typeof runResults) =>
      list.length === 0 ? null : Math.round((list.filter((r) => r.mentioned).length / list.length) * 100);

    return {
      runId: run.id,
      createdAt: run.created_at,
      chatgptRate: rate(chatgptResults),
      geminiRate: rate(geminiResults),
      overallRate: rate(runResults),
    };
  });

  return NextResponse.json(trends);
}
