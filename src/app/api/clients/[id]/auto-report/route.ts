import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { verifySession } from "@/lib/dal";
import { parseReportSections } from "@/lib/reportSections";

/** 자동 체크가 끝나면 리포트를 보낼지와, 리포트에 넣을 항목 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { enabled, sections } = await request.json();
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled 값이 필요합니다." }, { status: 400 });
  }
  const reportSections = parseReportSections(sections);
  if (reportSections.length === 0) {
    return NextResponse.json({ error: "리포트에 넣을 항목을 하나 이상 고르세요." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ auto_report_enabled: enabled, report_sections: reportSections })
    .eq("id", id)
    .select("id, auto_report_enabled, report_sections")
    .single();

  if (error) {
    const missing = /report_sections/.test(error.message);
    return NextResponse.json(
      { error: missing ? "DB에 리포트 항목 칸이 아직 없습니다. 019 마이그레이션을 실행하세요." : error.message },
      { status: 500 }
    );
  }
  return NextResponse.json(data);
}
