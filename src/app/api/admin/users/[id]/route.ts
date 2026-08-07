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

  const { email } = await request.json();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_users")
    .update({ email: typeof email === "string" && email.trim() ? email.trim() : null })
    .eq("id", id)
    .select("id, email")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  if (session.userId === id) {
    return NextResponse.json({ error: "본인 계정은 삭제할 수 없습니다." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("app_users").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
