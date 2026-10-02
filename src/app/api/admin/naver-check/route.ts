import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { getSupabaseServerClient } from "@/lib/supabase";
import { selectActiveKeywords } from "@/lib/keywords";
import { fetchKeywordStats, searchAdConfigured } from "@/lib/naver/searchAd";
import { checkNaverExposure, naverSearchConfigured } from "@/lib/naver/searchApi";

/**
 * 네이버 키 점검(관리자 전용). AI는 부르지 않고 네이버에만 묻는다. 저장하지 않는다.
 * - clientId 없이: 검색광고 API(검색량)와 검색 API(플레이스·블로그·웹문서)가 각각 되는지
 * - clientId를 주면: 그 병원의 질문(대표 검색어)별로 지금 네이버 순위를 미리 본다
 */
export async function GET(request: Request) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const clientId = new URL(request.url).searchParams.get("clientId");
  if (clientId) {
    if (!naverSearchConfigured()) return NextResponse.json({ error: "네이버 검색 API 키가 없습니다." }, { status: 503 });
    const supabase = getSupabaseServerClient();
    const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
    if (!client) return NextResponse.json({ error: "클라이언트를 찾을 수 없습니다." }, { status: 404 });
    const { data: keywords } = await selectActiveKeywords(supabase, clientId);
    const aliases = Array.isArray(client.aliases) ? client.aliases : [];
    const rows = await Promise.all(
      (keywords ?? []).map(async (k) => {
        const query = (k as { search_keyword?: string | null }).search_keyword || k.text;
        try {
          const e = await checkNaverExposure(query, { ...client, aliases });
          return { query, ...e };
        } catch (err) {
          return { query, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );
    return NextResponse.json({ client: client.name, blog: client.naver_blog_url ?? null, rows });
  }

  const result: Record<string, { ok: boolean; detail: string }> = {};

  if (!searchAdConfigured()) {
    result.searchAd = { ok: false, detail: "NAVER_AD_API_KEY·NAVER_AD_SECRET_KEY·NAVER_AD_CUSTOMER_ID가 설정되지 않았습니다." };
  } else {
    try {
      const stats = await fetchKeywordStats(["허리디스크"]);
      const hit = stats.find((s) => s.keyword === "허리디스크");
      result.searchAd = { ok: true, detail: `허리디스크 월 ${hit ? hit.total.toLocaleString() : "?"}회 검색 (연관 키워드 ${stats.length}개)` };
    } catch (err) {
      result.searchAd = { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  if (!naverSearchConfigured()) {
    result.search = { ok: false, detail: "NAVER_SEARCH_CLIENT_ID·NAVER_SEARCH_CLIENT_SECRET이 설정되지 않았습니다." };
  } else {
    try {
      const e = await checkNaverExposure("허리디스크 병원", { name: "점검용" });
      const part = (label: string, total: number) => (total < 0 ? `${label} 조회 안 됨` : `${label} ${total}건`);
      result.search = {
        ok: e.errors.length === 0,
        detail: [
          [part("플레이스", e.localTotal), part("블로그", e.blogTotal), part("웹문서", e.webTotal)].join(" · "),
          ...e.errors,
        ].join(" / "),
      };
    } catch (err) {
      result.search = { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json(result);
}
