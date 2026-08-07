import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { verifySession } from "@/lib/dal";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { enabled, day } = await request.json();
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled 값이 필요합니다." }, { status: 400 });
  }
  if (enabled && (typeof day !== "number" || day < 0 || day > 6)) {
    return NextResponse.json({ error: "요일을 선택하세요." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ auto_report_enabled: enabled, auto_report_day: enabled ? day : null })
    .eq("id", id)
    .select("id, auto_report_enabled, auto_report_day")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
