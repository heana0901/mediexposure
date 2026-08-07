import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServerClient } from "@/lib/supabase";
import { verifySession } from "@/lib/dal";

export async function GET() {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, username, is_admin, created_at, user_clients(client_id, clients(id, name))")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (data ?? []).map((u) => ({
    id: u.id,
    username: u.username,
    isAdmin: u.is_admin,
    createdAt: u.created_at,
    clients: (u.user_clients as unknown as { clients: { id: string; name: string } }[]).map(
      (uc) => uc.clients
    ),
  }));

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { username, password, isAdmin, clientIds } = await request.json();
  if (!username || typeof username !== "string" || !username.trim()) {
    return NextResponse.json({ error: "아이디를 입력하세요." }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 4) {
    return NextResponse.json({ error: "비밀번호는 4자 이상 입력하세요." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const passwordHash = await bcrypt.hash(password, 10);
  const { data: user, error } = await supabase
    .from("app_users")
    .insert({ username: username.trim(), password_hash: passwordHash, is_admin: !!isAdmin })
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "이미 존재하는 아이디입니다." : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const ids: string[] = Array.isArray(clientIds) ? clientIds : [];
  if (!isAdmin && ids.length > 0) {
    const { error: linkError } = await supabase
      .from("user_clients")
      .insert(ids.map((clientId) => ({ user_id: user.id, client_id: clientId })));
    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ id: user.id, username: user.username, isAdmin: user.is_admin });
}
