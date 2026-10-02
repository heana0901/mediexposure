import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";
import { rate, ratesByProvider, selfExposure } from "@/lib/aggregate";
import { fetchClientResults } from "@/lib/clientResults";
import { PROVIDER_META, isProvider, type Provider } from "@/lib/providers";
import type { TrendPoint } from "@/lib/types";

type RunRow = { id: string; created_at: string; query_mode?: string | null; samples?: number | null };
type ResultRow = { run_id: string; provider: string; mentioned: boolean; model: string | null; sample_index: number | null };

const MODE_LABEL: Record<string, string> = { natural: "자연 질문", list: "형식 지시" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });
  }

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();

  // * 로 읽으면 측정 조건 컬럼(016)이 있을 때만 query_mode·samples가 따라온다
  const runsQuery = await supabase
    .from("monitoring_runs")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (runsQuery.error) {
    return NextResponse.json({ error: runsQuery.error.message }, { status: 500 });
  }
  const runs = (runsQuery.data ?? []) as RunRow[];

  if (runs.length === 0) {
    return NextResponse.json([]);
  }

  let results: ResultRow[];
  try {
    results = await fetchClientResults<ResultRow>(
      supabase,
      clientId,
      "id, run_id, provider, mentioned, model, sample_index, created_at"
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const resultsByRun = new Map<string, ResultRow[]>();
  for (const r of results) {
    const list = resultsByRun.get(r.run_id) ?? [];
    list.push(r);
    resultsByRun.set(r.run_id, list);
  }

  // 측정 조건이 바뀐 실행을 찾는다. 한 AI가 그 회에만 빠진 건 조건 변경으로 보지 않도록
  // AI별 마지막 모델을 이어서 기억하고, 둘 다 측정한 AI끼리만 모델을 비교한다.
  const lastModel = new Map<Provider, string>();
  let lastMode: string | null = null;
  let lastSamples: number | null = null;
  let seenAny = false;

  const trends: TrendPoint[] = runs.map((run) => {
    const runResults = resultsByRun.get(run.id) ?? [];
    const tally = selfExposure(runResults);

    const mode = run.query_mode ?? "list";
    const samples = run.samples ?? Math.max(1, ...runResults.map((r) => (r.sample_index ?? 0) + 1));
    const models = new Map<Provider, string>();
    for (const r of runResults) if (isProvider(r.provider) && r.model) models.set(r.provider, r.model);

    let conditionChanged = false;
    if (runResults.length > 0) {
      if (seenAny) {
        conditionChanged =
          mode !== lastMode ||
          samples !== lastSamples ||
          [...models].some(([p, m]) => lastModel.has(p) && lastModel.get(p) !== m);
      }
      seenAny = true;
      lastMode = mode;
      lastSamples = samples;
      for (const [p, m] of models) lastModel.set(p, m);
    }

    const condition = runResults.length
      ? [
          MODE_LABEL[mode] ?? mode,
          `질문당 ${samples}회`,
          [...models].map(([p, m]) => `${PROVIDER_META[p].label} ${m}`).join(", "),
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

    return {
      runId: run.id,
      createdAt: run.created_at,
      rates: ratesByProvider(runResults),
      counts: tally.byProvider,
      overallRate: rate(runResults),
      overall: { count: tally.count, total: tally.total },
      condition,
      conditionChanged,
    };
  });

  return NextResponse.json(trends);
}
