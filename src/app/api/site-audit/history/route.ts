import { NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/dal";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isLegacySite, type SiteComparisonResult, type SiteDiagnosis } from "@/lib/diagnose-shared";
import type { SiteAuditHistoryEntry } from "@/lib/types";

/** 한 클라이언트의 홈페이지 분석 점수 기록 (오래된 순). 25항목·100점 진단만 점수가 있다. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_audits")
    .select("id, result, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const history: SiteAuditHistoryEntry[] = [];
  for (const row of data ?? []) {
    const result = row.result as SiteComparisonResult;
    const site = result?.sites?.[0];
    if (!site || isLegacySite(site)) continue;
    const diagnosis = site as SiteDiagnosis;
    if (diagnosis.error) continue;
    history.push({
      id: row.id,
      createdAt: row.created_at,
      url: diagnosis.finalUrl || diagnosis.url,
      score: diagnosis.score,
      grade: diagnosis.grade,
      axes: diagnosis.axes.map((a) => ({ axis: a.axis, score: a.score })),
      passed: diagnosis.checks.filter((c) => c.status === "pass").length,
      total: diagnosis.checks.length,
      checks: diagnosis.checks.map((c) => ({ id: c.id, name: c.name, status: c.status, axis: c.axis })),
    });
  }

  return NextResponse.json(history);
}
