import "server-only";
import { getSupabaseServerClient } from "./supabase";
import { getRecentRunIds, dedupeUnexposed } from "./recentUnexposed";
import { competitorFrequency, EMPTY_SELF_EXPOSURE, rate, ratesByProvider, selfExposure as tallySelf } from "./aggregate";
import { fetchAllPages, fetchClientResults } from "./clientResults";
import { isProvider, providersIn, type Provider } from "./providers";
import type { CompetitorFrequencyEntry, ResultWithKeyword, SelfExposure } from "./types";
import { keywordTextOf } from "./types";

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
};

export async function getClientReportData(clientId: string): Promise<ClientReportData> {
  const supabase = getSupabaseServerClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, client_type, region, department, director_name, contact_email")
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

  const { data: runs } = await supabase
    .from("monitoring_runs")
    .select("id, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

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

  return {
    client,
    providers: providersIn(allResults),
    selfExposure: tallySelf(allResults),
    competitorTop5: competitorFrequency(allResults).slice(0, 5),
    unexposedRecent,
    unexposedCount: unexposedAll.length,
    weeklyTrend,
  };
}
