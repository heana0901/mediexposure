import "server-only";
import { getSupabaseServerClient } from "./supabase";
import { getRecentRunIds, dedupeUnexposed } from "./recentUnexposed";
import {
  competitorFrequency,
  EMPTY_SELF_EXPOSURE,
  rate,
  ratesByProvider,
  selfExposure as tallySelf,
  visibilityMetrics,
} from "./aggregate";
import { fetchAllPages, fetchClientResults } from "./clientResults";
import { isProvider, PROVIDER_META, providersIn, type Provider } from "./providers";
import type { CompetitorFrequencyEntry, ResultWithKeyword, SelfExposure, VisibilityMetrics } from "./types";
import { keywordTextOf } from "./types";
import { selectActiveKeywords } from "./keywords";
import { demandSummary } from "./naver/demand";

export type ClientReportData = {
  client: {
    id: string;
    name: string;
    client_type: "hospital" | "business";
    region: string | null;
    department: string | null;
    director_name: string | null;
    contact_email: string | null;
  };
  /** 리포트 표에 열로 그릴 AI (실제로 측정한 AI만) */
  providers: Provider[];
  selfExposure: SelfExposure;
  competitorTop5: CompetitorFrequencyEntry[];
  unexposedRecent: { provider: Provider; keyword: string; competitors: string[] }[];
  unexposedCount: number;
  weeklyTrend: { createdAt: string; rates: Partial<Record<Provider, number>>; overallRate: number | null }[];
  metrics: VisibilityMetrics;
  /** 검색 수요(네이버 월간 검색량) 반영 AI 추천 확률. 검색량을 모르면 null */
  demand: { weightedRate: number; totalVolume: number } | null;
  /** 리포트 하단에 적는 측정 방법 한 줄 (최근 실행 기준) */
  method: string | null;
};

const MODE_LABEL: Record<string, string> = {
  natural: "환자가 검색창에 치는 문장 그대로",
  list: "추천 목록 형식으로",
};

export async function getClientReportData(clientId: string): Promise<ClientReportData> {
  const supabase = getSupabaseServerClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (clientError || !client) throw new Error(clientError?.message ?? "클라이언트를 찾을 수 없습니다.");

  const allResults = await fetchClientResults(supabase, clientId);

  if (allResults.length === 0) {
    return {
      client,
      providers: [],
      selfExposure: EMPTY_SELF_EXPOSURE,
      competitorTop5: [],
      unexposedRecent: [],
      unexposedCount: 0,
      weeklyTrend: [],
      metrics: visibilityMetrics([], client.website_url),
      demand: null,
      method: null,
    };
  }

  const recentRunIds = await getRecentRunIds(supabase, clientId, 3);
  const recentResults = recentRunIds.size
    ? await fetchAllPages<ResultWithKeyword>((from, to) =>
        supabase
          .from("monitoring_results")
          .select("*, keywords(text)")
          .in("run_id", [...recentRunIds])
          .not("keyword_id", "is", null)
          .order("id", { ascending: true })
          .range(from, to)
      )
    : [];
  const unexposedAll = dedupeUnexposed(recentResults, recentRunIds).filter((r) => isProvider(r.provider));

  const unexposedRecent = unexposedAll.slice(0, 8).map((r) => ({
    provider: r.provider,
    keyword: keywordTextOf(r),
    competitors: r.competitors ?? [],
  }));

  const runsQuery = await supabase
    .from("monitoring_runs")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  const runs = (runsQuery.data ?? []) as { id: string; created_at: string; query_mode?: string | null; samples?: number | null }[];

  // 같은 날짜에 여러 번 실행됐으면 그날의 결과를 모두 합쳐서 하나로 집계한다
  const runDateById = new Map((runs ?? []).map((r) => [r.id, r.created_at.slice(0, 10)]));
  const resultsByDate = new Map<string, typeof allResults>();
  for (const result of allResults) {
    const dateKey = runDateById.get(result.run_id);
    if (!dateKey) continue;
    const list = resultsByDate.get(dateKey) ?? [];
    list.push(result);
    resultsByDate.set(dateKey, list);
  }
  const sortedDates = Array.from(resultsByDate.keys()).sort();

  const weeklyTrend = sortedDates.slice(-7).map((dateKey) => {
    const forDate = resultsByDate.get(dateKey) ?? [];
    return { createdAt: dateKey, rates: ratesByProvider(forDate), overallRate: rate(forDate) };
  });

  const aliases: string[] = Array.isArray(client.aliases) ? client.aliases : [];

  // 측정 방법: 가장 최근 실행의 질문 방식·반복 횟수·AI 모델
  const latestRun = [...runs].reverse().find((r) => allResults.some((x) => x.run_id === r.id));
  let method: string | null = null;
  if (latestRun) {
    const latestRows = allResults.filter((r) => r.run_id === latestRun.id);
    const models = new Map<string, string>();
    for (const r of latestRows) if (isProvider(r.provider) && r.model) models.set(PROVIDER_META[r.provider].label, r.model);
    const mode = MODE_LABEL[latestRun.query_mode ?? "list"];
    const samples = latestRun.samples ?? 1;
    method = `측정 방법: ${[...models].map(([p, m]) => `${p}(${m})`).join(" · ")}에 ${mode} 질문을 ${samples}회씩 묻고, 답변 원문에 병원 이름이 실제로 있을 때만 노출로 집계했습니다.`;
  }

  const { data: activeKeywords } = await selectActiveKeywords(supabase, clientId);
  const demandData = demandSummary((activeKeywords ?? []) as Parameters<typeof demandSummary>[0], allResults);

  return {
    client,
    demand:
      demandData.weightedRate === null
        ? null
        : { weightedRate: demandData.weightedRate, totalVolume: demandData.totalVolume },
    providers: providersIn(allResults),
    selfExposure: tallySelf(allResults),
    competitorTop5: competitorFrequency(allResults, { name: client.name, aliases }).slice(0, 5),
    metrics: visibilityMetrics(allResults, client.website_url),
    method,
    unexposedRecent,
    unexposedCount: unexposedAll.length,
    weeklyTrend,
  };
}
