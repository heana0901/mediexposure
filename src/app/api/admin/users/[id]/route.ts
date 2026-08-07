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

  const { clientIds } = await request.json();
  if (!Array.isArray(clientIds)) {
    return NextResponse.json({ error: "clientIds가 필요합니다." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { error: deleteError } = await supabase.from("user_clients").delete().eq("user_id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (clientIds.length > 0) {
    const { error: insertError } = await supabase
      .from("user_clients")
      .insert(clientIds.map((clientId: string) => ({ user_id: id, client_id: clientId })));
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
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
