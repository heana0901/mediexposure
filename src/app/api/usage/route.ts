import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getAllowedClientIds, verifySession } from "@/lib/dal";
import { fetchAllPages } from "@/lib/clientResults";
import { selectActiveKeywords } from "@/lib/keywords";
import { getActiveProviders, getSampleCount } from "@/lib/ai/registry";
import { isProvider, type Provider } from "@/lib/providers";
import { clientIntervalDays, getIntervalDays, minRunGapMs } from "@/lib/schedule";
import type { UsageSummary } from "@/lib/types";

/**
 * 비용 현황: 지난달 실제 비용, 이번 달 지금까지 비용, 이번 달 예상 비용.
 *
 * 예상 = 지금까지 쓴 비용 + (이번 달 남은 자동 실행 횟수 × 1회 실행 예상 비용).
 * 1회 실행 예상 비용 = 질문 수 × Σ(AI별 질문당 평균 반복 횟수 × 질문 1회 비용).
 * 질문 1회 비용과 반복 횟수는 최근 30일 새 방식 실행의 실측값을 쓰고, 실측이 없는 AI는 추정값을 쓴다.
 * 홈페이지 분석·콘텐츠 제안처럼 모니터링 밖에서 쓴 비용은 기록되지 않아 빠진다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 원화 환산용 대략 환율 */
const KRW_PER_USD = 1400;
/** 실측이 없을 때 쓰는 질문 1회 비용(USD) — 2026-10 공개 단가 기준 추정 */
const DEFAULT_COST_PER_CALL: Record<Provider, number> = {
  chatgpt: 0.03,
  gemini: 0.006,
  perplexity: 0.006,
  claude: 0.12,
};
/** vercel.json cron: 매일 03:00 UTC(한국 12:00) */
const CRON_HOUR_UTC = 3;

type Row = {
  provider: string;
  run_id: string;
  keyword_id: string | null;
  estimated_cost_usd: number | null;
  created_at: string;
  monitoring_runs: { client_id: string; query_mode?: string | null };
};

/** 한국 시간 기준 달의 시작 시각(UTC) */
function kstMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS);
}

/** 그 시각 이후 처음 돌아오는 cron 시각 */
function nextCron(at: number): number {
  const d = new Date(at);
  const sameDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), CRON_HOUR_UTC);
  return sameDay >= at ? sameDay : sameDay + DAY_MS;
}

/** 마지막 실행 시각으로부터, 다음 달이 되기 전까지 자동 실행이 몇 번 더 돌지 */
function remainingCronRuns(lastRunAt: number | null, now: number, monthEnd: number, intervalDays: number): number {
  // cron은 매일 깨우고, 마지막 실행 후 (주기 × 24 - 12)시간이 지난 클라이언트만 돌린다
  const minGap = minRunGapMs(intervalDays);
  let next = nextCron(lastRunAt === null ? now : Math.max(now, lastRunAt + minGap));
  let count = 0;
  while (next < monthEnd) {
    count += 1;
    next = nextCron(next + minGap);
  }
  return count;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

export async function GET() {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const supabase = getSupabaseServerClient();
  const allowedIds = await getAllowedClientIds(session);

  let clientList: { id: string; name: string; monitor_interval_days?: number | null }[] = [];
  if (allowedIds === null || allowedIds.length > 0) {
    // "*": 018 이전 DB(monitor_interval_days 없음)에서도 깨지지 않게
    let clientsQuery = supabase.from("clients").select("*").order("created_at", { ascending: true });
    if (allowedIds !== null) clientsQuery = clientsQuery.in("id", allowedIds);
    const { data: clients, error: clientsError } = await clientsQuery;
    if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
    clientList = clients ?? [];
  }
  const clientIds = clientList.map((c) => c.id);

  const now = Date.now();
  const kstNow = new Date(now + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth();
  const lastStart = kstMonthStart(year, month - 1).getTime();
  const thisStart = kstMonthStart(year, month).getTime();
  const nextStart = kstMonthStart(year, month + 1).getTime();
  const monthLabel = (y: number, m: number) => {
    const d = new Date(Date.UTC(y, m, 1));
    return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`;
  };

  // 지난달 1일부터의 결과 (1000행 제한을 넘겨 끝까지 읽는다)
  let rows: Row[] = [];
  if (clientIds.length) {
    try {
      rows = await fetchAllPages<Row>((from, to) =>
        supabase
          .from("monitoring_results")
          .select("id, provider, run_id, keyword_id, estimated_cost_usd, created_at, monitoring_runs!inner(*)")
          .in("monitoring_runs.client_id", clientIds)
          .gte("created_at", new Date(lastStart).toISOString())
          .order("id", { ascending: true })
          .range(from, to)
      );
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // AI별 질문 1회 비용과 반복 횟수: 최근 30일, 새 방식(측정 조건이 기록된) 실행만
  const recent = rows.filter(
    (r) => Date.parse(r.created_at) >= now - 30 * DAY_MS && r.monitoring_runs.query_mode && isProvider(r.provider)
  );
  const providers = getActiveProviders();
  const baseSamples = getSampleCount();
  const costPerCall: UsageSummary["costPerCall"] = {};
  for (const p of providers) {
    const mine = recent.filter((r) => r.provider === p && r.estimated_cost_usd !== null);
    const groups = new Map<string, number>();
    for (const r of recent.filter((x) => x.provider === p)) {
      const key = `${r.run_id}|${r.keyword_id}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const measured = mine.length >= 5;
    costPerCall[p] = {
      usd: measured ? mine.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0) / mine.length : DEFAULT_COST_PER_CALL[p],
      samples: groups.size ? [...groups.values()].reduce((a, b) => a + b, 0) / groups.size : baseSamples,
      measured,
    };
  }
  const perQuestionUsd = providers.reduce((s, p) => s + costPerCall[p]!.usd * costPerCall[p]!.samples, 0);

  // 클라이언트별 마지막 실행 시각 (남은 자동 실행 계산용)
  const { data: lastRuns } = clientIds.length
    ? await supabase
        .from("monitoring_runs")
        .select("client_id, created_at")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false })
    : { data: [] as { client_id: string; created_at: string }[] };
  const lastRunAt = new Map<string, number>();
  for (const r of lastRuns ?? []) if (!lastRunAt.has(r.client_id)) lastRunAt.set(r.client_id, Date.parse(r.created_at));

  const byClient: UsageSummary["byClient"] = await Promise.all(
    clientList.map(async (c) => {
      const mine = rows.filter((r) => r.monitoring_runs.client_id === c.id);
      const last = mine.filter((r) => Date.parse(r.created_at) < thisStart);
      const current = mine.filter((r) => Date.parse(r.created_at) >= thisStart);
      const { data: keywords } = await selectActiveKeywords(supabase, c.id, "id");
      const keywordCount = keywords?.length ?? 0;
      const perRunUsd = keywordCount * perQuestionUsd;
      const intervalDays = clientIntervalDays(c);
      const remainingRuns = keywordCount ? remainingCronRuns(lastRunAt.get(c.id) ?? null, now, nextStart, intervalDays) : 0;
      const thisMonthUsd = current.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0);
      return {
        clientId: c.id,
        clientName: c.name,
        keywords: keywordCount,
        intervalDays,
        perRunUsd: round(perRunUsd),
        lastMonthRuns: new Set(last.map((r) => r.run_id)).size,
        lastMonthUsd: round(last.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0)),
        thisMonthRuns: new Set(current.map((r) => r.run_id)).size,
        thisMonthUsd: round(thisMonthUsd),
        remainingRuns,
        projectedUsd: round(thisMonthUsd + remainingRuns * perRunUsd),
      };
    })
  );

  const sum = (pick: (c: UsageSummary["byClient"][number]) => number) => round(byClient.reduce((s, c) => s + pick(c), 0));
  const summary: UsageSummary = {
    krwPerUsd: KRW_PER_USD,
    assumptions: {
      defaultIntervalDays: getIntervalDays(),
      providers,
      baseSamples,
    },
    costPerCall,
    lastMonth: { label: monthLabel(year, month - 1), runs: sum((c) => c.lastMonthRuns), costUsd: sum((c) => c.lastMonthUsd) },
    thisMonth: {
      label: monthLabel(year, month),
      runs: sum((c) => c.thisMonthRuns),
      costUsd: sum((c) => c.thisMonthUsd),
      remainingRuns: sum((c) => c.remainingRuns),
      projectedUsd: sum((c) => c.projectedUsd),
    },
    byClient: byClient.sort((a, b) => b.projectedUsd - a.projectedUsd),
  };

  return NextResponse.json(summary);
}
