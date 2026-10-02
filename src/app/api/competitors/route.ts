import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";
import { getRecentRunIds, dedupeUnexposed } from "@/lib/recentUnexposed";
import {
  competitorFrequency,
  EMPTY_SELF_EXPOSURE,
  selfExposure,
  sourceFrequency,
  visibilityMetrics,
} from "@/lib/aggregate";
import { fetchAllPages, fetchClientResults } from "@/lib/clientResults";
import { verifyHospitals } from "@/lib/hospitalRegistry";
import { nameKey } from "@/lib/nameMatch";
import type { ResultWithKeyword } from "@/lib/types";

/** 실존 확인은 화면에 보이는 상위 병원만 한다 */
const VERIFY_TOP = 10;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });
  }

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();

  const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
  const aliases: string[] = Array.isArray(client?.aliases) ? client.aliases : [];

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
      metrics: visibilityMetrics([], client?.website_url),
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

  const competitors = competitorFrequency(allResults, client ? { name: client.name, aliases } : undefined);

  // 건강보험심사평가원 병원정보로 실존 여부 확인 (HIRA_SERVICE_KEY가 있을 때만)
  const top = competitors.slice(0, VERIFY_TOP);
  const registry = await verifyHospitals(
    supabase,
    top.map((c) => c.name),
    client?.region
  ).catch(() => new Map());
  const annotated = competitors.map((c) => {
    const match = registry.get(nameKey(c.name));
    return match ? { ...c, registry: match } : c;
  });

  return NextResponse.json({
    unexposed: dedupeUnexposed(recentResults, recentRunIds),
    competitorFrequency: annotated,
    sourceFrequency: sourceFrequency(allResults),
    totalResults: allResults.length,
    selfExposure: selfExposure(allResults),
    metrics: visibilityMetrics(allResults, client?.website_url),
  });
}
