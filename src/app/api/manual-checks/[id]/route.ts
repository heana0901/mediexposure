import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: check } = await supabase.from("manual_checks").select("client_id").eq("id", id).maybeSingle();
  if (!check) return NextResponse.json({ error: "기록을 찾을 수 없습니다." }, { status: 404 });

  const access = await assertClientAccess(check.client_id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const { error } = await supabase.from("manual_checks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
