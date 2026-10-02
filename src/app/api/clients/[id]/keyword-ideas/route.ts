import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";
import { selectActiveKeywords } from "@/lib/keywords";
import { fetchKeywordStats, searchAdConfigured, toAdKeyword } from "@/lib/naver/searchAd";
import { clientNameVariants, nameKey } from "@/lib/nameMatch";
import { competitorFrequency } from "@/lib/aggregate";
import { fetchClientResults } from "@/lib/clientResults";
import type { KeywordIdea } from "@/lib/types";

const MAX_IDEAS = 40;

/** "경기도 안산시 단원구 …" → ["안산"] : 시·군·구 이름에서 접미사를 뗀 지역 토큰 */
function regionTokens(region: string | null | undefined): string[] {
  return (region ?? "")
    .split(/\s+/)
    .filter((t) => /(시|군|구)$/.test(t) && t.length >= 2)
    .map((t) => t.replace(/(특별시|광역시|시|군|구)$/, ""))
    .filter((t) => t.length >= 2);
}

/**
 * 모니터링 질문 추천: 네이버 검색광고 키워드 도구의 연관 키워드를 검색량 순으로.
 * seeds를 주지 않으면 지역+진료과와 지금 질문들의 대표 검색어로 찾는다.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await assertClientAccess(id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  if (!searchAdConfigured()) {
    return NextResponse.json(
      { error: "네이버 검색광고 API 키가 설정되지 않았습니다. Vercel 환경변수 NAVER_AD_API_KEY·NAVER_AD_SECRET_KEY·NAVER_AD_CUSTOMER_ID를 확인하세요." },
      { status: 503 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) return NextResponse.json({ error: "클라이언트를 찾을 수 없습니다." }, { status: 404 });

  const { data: keywords } = await selectActiveKeywords(supabase, id);
  const regions = regionTokens(client.region);
  const department = (client.department ?? "").trim();

  const seedParam = new URL(request.url).searchParams.get("seeds");
  const seeds = seedParam
    ? seedParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [
        ...regions.slice(0, 1).flatMap((r) => (department ? [`${r} ${department}`] : [])),
        ...(keywords ?? []).map((k) => (k as { search_keyword?: string | null }).search_keyword ?? k.text),
      ].slice(0, 10);

  if (seeds.length === 0) {
    return NextResponse.json({ error: "찾을 키워드를 입력하세요." }, { status: 400 });
  }

  let stats;
  try {
    stats = await fetchKeywordStats(seeds);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  const ours = clientNameVariants(client.name, Array.isArray(client.aliases) ? client.aliases : []);
  const results = await fetchClientResults(supabase, id).catch(() => []);
  const rivals = competitorFrequency(results, { name: client.name }).slice(0, 30);
  const monitored = new Set((keywords ?? []).map((k) => toAdKeyword((k as { search_keyword?: string | null }).search_keyword ?? k.text)));

  const ideas: KeywordIdea[] = stats
    .filter((s) => !monitored.has(s.keyword))
    // 지역 병원이므로 지역명이 들어간 검색어를 우선 보여준다(지역이 없으면 전부)
    .filter((s) => regions.length === 0 || seedParam || regions.some((r) => s.keyword.includes(r)))
    .map((s) => {
      const key = nameKey(s.keyword);
      const rival = rivals.find((c) => {
        const ck = nameKey(c.name);
        return ck.length >= 3 && key.includes(ck.replace(/(병원|의원)$/, ""));
      });
      return {
        keyword: s.keyword,
        volume: s.total,
        approx: s.approx,
        competition: s.competition,
        brand: ours.some((o) => key.includes(o)),
        competitorBrand: rival ? rival.name : null,
      };
    })
    .sort((a, b) => b.volume - a.volume)
    .slice(0, MAX_IDEAS);

  return NextResponse.json({ seeds, ideas });
}
