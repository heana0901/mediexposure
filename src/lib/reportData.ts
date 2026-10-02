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
import { selectActiveKeywords } from "./keywords";
import { demandSummary } from "./naver/demand";
import { getContentPlan } from "./contentPlan";
import { buildFixItems } from "./siteFixGuide";
import { isLegacySite, type SiteComparisonResult, type SiteDiagnosis } from "./diagnose-shared";
import type { ContentPlan, ExposureTally } from "./types";
import { parseReportSections, type ReportSection } from "./reportSections";

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
  /** 리포트에 넣을 항목 (병원별 설정) */
  sections: ReportSection[];
  /** 리포트 표에 열로 그릴 AI (실제로 측정한 AI만) */
  providers: Provider[];
  selfExposure: SelfExposure;
  competitorTop5: CompetitorFrequencyEntry[];
  unexposedCount: number;
  weeklyTrend: { createdAt: string; rates: Partial<Record<Provider, number>>; overallRate: number | null }[];
  metrics: VisibilityMetrics;
  /** 검색 수요(네이버 월간 검색량) 반영 AI 추천 확률. 검색량을 모르면 null */
  demand: { weightedRate: number; totalVolume: number } | null;
  /** 리포트 하단에 적는 측정 방법 한 줄 (최근 실행 기준) */
  method: string | null;
  /** 질문별 현황 (최근 3회 실행): 검색량·AI 추천 횟수·대신 추천된 곳·네이버 순위 */
  questions: ReportQuestion[];
  /** 콘텐츠 처방 (최근 실행 기준) */
  contentPlan: ContentPlan | null;
  /** 가장 최근 홈페이지 분석 점수와 먼저 고칠 항목 */
  siteAudit: ReportSiteAudit | null;
};

export type ReportQuestion = {
  text: string;
  volume: number | null;
  volumeNote: string | null;
  tally: ExposureTally;
  rivals: string[];
  /** 네이버 순위 (플레이스·블로그·웹문서). 기록이 없으면 null */
  naver: { local: number | null; blog: number | null; web: number | null } | null;
};

export type ReportSiteAudit = {
  url: string;
  score: number;
  grade: string;
  auditedAt: string;
  previousScore: number | null;
  fixes: { name: string; status: string; gain: number; why: string }[];
};

const MODE_LABEL: Record<string, string> = {
  natural: "환자가 검색창에 치는 문장 그대로",
  list: "추천 목록 형식으로",
};

/** 홈페이지 분석 기록 중 가장 최근 것과 그 직전 점수 */
async function latestSiteAudit(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  client: { id: string; name: string; region?: string | null; department?: string | null; aliases?: unknown; naver_blog_url?: string | null; website_url?: string | null }
): Promise<ReportSiteAudit | null> {
  const { data } = await supabase
    .from("site_audits")
    .select("result, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const audits = (data ?? [])
    .map((row) => ({ site: (row.result as SiteComparisonResult)?.sites?.[0], createdAt: row.created_at as string }))
    .filter((a): a is { site: SiteDiagnosis; createdAt: string } => Boolean(a.site) && !isLegacySite(a.site!) && !a.site!.error);
  const [latest, previous] = audits;
  if (!latest) return null;

  const fixes = buildFixItems(latest.site, {
    hospitalName: client.name,
    siteUrl: latest.site.finalUrl || latest.site.url,
    region: client.region,
    department: client.department,
    aliases: Array.isArray(client.aliases) ? client.aliases : [],
    naverBlogUrl: client.naver_blog_url ?? null,
    isClinic: /의원$/.test(client.name),
  });
  return {
    url: latest.site.finalUrl || latest.site.url,
    score: latest.site.score,
    grade: latest.site.grade,
    auditedAt: latest.createdAt,
    previousScore: previous?.site.score ?? null,
    fixes: fixes.slice(0, 4).map((f) => ({ name: f.check.name, status: f.check.status, gain: f.gain, why: f.why || f.check.detail })),
  };
}

/** 질문별 현황: 검색량 많은 순 */
async function questionSummary(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  client: { name: string; aliases?: unknown },
  keywords: { id: string; text: string; search_volume?: number | null; search_volume_note?: string | null }[],
  recentResults: ResultWithKeyword[],
  recentRunIds: Set<string>
): Promise<ReportQuestion[]> {
  const naverByKeyword = new Map<string, ReportQuestion["naver"]>();
  if (recentRunIds.size) {
    const { data } = await supabase
      .from("naver_results")
      .select("keyword_id, local_rank, blog_rank, web_rank, created_at")
      .in("run_id", [...recentRunIds])
      .order("created_at", { ascending: false });
    for (const r of data ?? []) {
      if (!r.keyword_id || naverByKeyword.has(r.keyword_id)) continue;
      naverByKeyword.set(r.keyword_id, { local: r.local_rank, blog: r.blog_rank, web: r.web_rank });
    }
  }
  const aliases = Array.isArray(client.aliases) ? (client.aliases as string[]) : [];

  return keywords
    .map((k) => {
      const rows = recentResults.filter((r) => r.keyword_id === k.id && isProvider(r.provider));
      return {
        text: k.text,
        volume: k.search_volume ?? null,
        volumeNote: k.search_volume_note ?? null,
        tally: { count: rows.filter((r) => r.mentioned).length, total: rows.length },
        rivals: competitorFrequency(
          rows.filter((r) => !r.mentioned),
          { name: client.name, aliases }
        )
          .slice(0, 2)
          .map((c) => c.name),
        naver: naverByKeyword.get(k.id) ?? null,
      };
    })
    .filter((q) => q.tally.total > 0)
    .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
}

/**
 * 리포트에 들어갈 내용. 병원별로 고른 항목(sections)만 채운다.
 * generatePlan: 콘텐츠 처방이 최근 실행보다 오래됐으면 새로 만든다. 자동 실행 중 발송처럼
 * 시간이 빠듯할 때는 false로 저장된 처방만 쓴다 (처방은 실행 직후에 이미 만들어 둔다).
 */
export async function getClientReportData(
  clientId: string,
  { generatePlan = true }: { generatePlan?: boolean } = {}
): Promise<ClientReportData> {
  const supabase = getSupabaseServerClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (clientError || !client) throw new Error(clientError?.message ?? "클라이언트를 찾을 수 없습니다.");

  const sections = parseReportSections(client.report_sections);
  const wants = (section: ReportSection) => sections.includes(section);
  const allResults = await fetchClientResults(supabase, clientId);

  if (allResults.length === 0) {
    return {
      client,
      sections,
      providers: [],
      selfExposure: EMPTY_SELF_EXPOSURE,
      competitorTop5: [],
      unexposedCount: 0,
      weeklyTrend: [],
      metrics: visibilityMetrics([], client.website_url),
      demand: null,
      method: null,
      questions: [],
      contentPlan: null,
      siteAudit: wants("site") ? await latestSiteAudit(supabase, client) : null,
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

  const [questions, contentPlan, siteAudit] = await Promise.all([
    wants("exposure")
      ? questionSummary(
          supabase,
          client,
          (activeKeywords ?? []) as Parameters<typeof questionSummary>[2],
          recentResults,
          recentRunIds
        )
      : [],
    wants("competitors")
      ? getContentPlan(supabase, client, { generate: generatePlan }).catch((err) => {
          console.error("[report] 콘텐츠 처방 실패", err);
          return null;
        })
      : null,
    wants("site") ? latestSiteAudit(supabase, client) : null,
  ]);

  return {
    client,
    sections,
    demand:
      demandData.weightedRate === null
        ? null
        : { weightedRate: demandData.weightedRate, totalVolume: demandData.totalVolume },
    providers: providersIn(allResults),
    selfExposure: tallySelf(allResults),
    competitorTop5: competitorFrequency(allResults, { name: client.name, aliases }).slice(0, 5),
    metrics: visibilityMetrics(allResults, client.website_url),
    method,
    unexposedCount: unexposedAll.length,
    weeklyTrend,
    questions,
    contentPlan,
    siteAudit,
  };
}
