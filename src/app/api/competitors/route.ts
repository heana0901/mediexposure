import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";
import { getRecentRunIds, dedupeUnexposed } from "@/lib/recentUnexposed";
import { competitorFrequency, EMPTY_SELF_EXPOSURE, selfExposure, sourceFrequency } from "@/lib/aggregate";
import { fetchAllPages, fetchClientResults } from "@/lib/clientResults";
import type { ResultWithKeyword } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });
  }

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();

  let allResults;
  try {
    allResults = await fetchClientResults(supabase, clientId);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  if (allResults.length === 0) {
    return NextResponse.json({
      unexposed: [],
      competitorFrequency: [],
      sourceFrequency: [],
      totalResults: 0,
      selfExposure: EMPTY_SELF_EXPOSURE,
    });
  }

  // 미노출 카드는 최근 실행분만 원문과 함께 읽는다
  const recentRunIds = await getRecentRunIds(supabase, clientId, 3);
  let recentResults: ResultWithKeyword[] = [];
  try {
    recentResults = recentRunIds.size
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
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  return NextResponse.json({
    unexposed: dedupeUnexposed(recentResults, recentRunIds),
    competitorFrequency: competitorFrequency(allResults),
    sourceFrequency: sourceFrequency(allResults),
    totalResults: allResults.length,
    selfExposure: selfExposure(allResults),
  });
}
