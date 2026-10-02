import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { fetchKeywordStats, searchAdConfigured } from "@/lib/naver/searchAd";
import { checkNaverExposure, naverSearchConfigured } from "@/lib/naver/searchApi";

/**
 * 네이버 키 점검(관리자 전용). AI는 부르지 않고 네이버에 한 번씩만 물어
 * 검색광고 API(검색량)와 검색 API(플레이스·블로그·웹문서)가 각각 되는지 알려준다.
 */
export async function GET() {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

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
      result.search = { ok: true, detail: `플레이스 ${e.localTotal}곳 · 블로그 ${e.blogTotal}건 · 웹문서 ${e.webTotal}건 조회됨` };
    } catch (err) {
      result.search = { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json(result);
}
