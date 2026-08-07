import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getAllowedClientIds, verifySession } from "@/lib/dal";

export async function GET() {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const supabase = getSupabaseServerClient();
  const allowedIds = await getAllowedClientIds(session);

  let query = supabase.from("clients").select("*").order("created_at", { ascending: true });
  if (allowedIds !== null) {
    if (allowedIds.length === 0) return NextResponse.json([]);
    query = query.in("id", allowedIds);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { name, region, department, director_name, is_specialist } = await request.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "병원명을 입력하세요." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: name.trim(),
      region: region?.trim() || null,
      department: department?.trim() || null,
      director_name: director_name?.trim() || null,
      is_specialist: typeof is_specialist === "boolean" ? is_specialist : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
