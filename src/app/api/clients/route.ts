import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getAllowedClientIds, verifySession } from "@/lib/dal";
import { parseAliases } from "@/lib/aliases";

export async function GET() {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const supabase = getSupabaseServerClient();
  const allowedIds = await getAllowedClientIds(session);

  let query = supabase.from("clients").select("*");
  if (allowedIds !== null) {
    if (allowedIds.length === 0) return NextResponse.json([]);
    query = query.in("id", allowedIds);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 가나다순. DB 정렬은 콜레이션에 따라 달라질 수 있어 여기서 한국어 기준으로 맞춘다
  return NextResponse.json((data ?? []).sort((a, b) => a.name.localeCompare(b.name, "ko")));
}

export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const { name, client_type, region, department, director_name, is_specialist, contact_email, website_url, aliases, naver_blog_url } =
    await request.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  }
  const parsedAliases = parseAliases(aliases);

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      ...(typeof naver_blog_url === "string" ? { naver_blog_url: naver_blog_url.trim() || null } : {}),
      ...(parsedAliases?.length ? { aliases: parsedAliases } : {}),
      name: name.trim(),
      client_type: client_type === "business" ? "business" : "hospital",
      region: region?.trim() || null,
      department: department?.trim() || null,
      director_name: director_name?.trim() || null,
      is_specialist: typeof is_specialist === "boolean" ? is_specialist : null,
      contact_email: contact_email?.trim() || null,
      website_url: website_url?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
