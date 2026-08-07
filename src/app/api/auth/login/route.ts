import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createSession } from "@/lib/session";

export async function POST(request: Request) {
  const { username, password } = await request.json();
  if (!username || !password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: user } = await supabase
    .from("app_users")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  await createSession({ userId: user.id, username: user.username, isAdmin: user.is_admin });

  return NextResponse.json({ username: user.username, isAdmin: user.is_admin });
}
