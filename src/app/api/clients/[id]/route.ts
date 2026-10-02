import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess, verifySession } from "@/lib/dal";
import { parseAliases } from "@/lib/aliases";
import { rejudgeClient } from "@/lib/rejudge";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await assertClientAccess(id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const { name, client_type, region, department, director_name, is_specialist, contact_email, website_url, aliases } =
    await request.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  }
  // 별칭을 보내지 않은 수정(예: 홈페이지 주소만 저장)은 기존 별칭을 건드리지 않는다
  const parsedAliases = parseAliases(aliases);

  const supabase = getSupabaseServerClient();
  const { data: before } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();

  const { data, error } = await supabase
    .from("clients")
    .update({
      ...(parsedAliases !== undefined ? { aliases: parsedAliases } : {}),
      name: name.trim(),
      client_type: client_type === "business" ? "business" : "hospital",
      region: region?.trim() || null,
      department: department?.trim() || null,
      director_name: director_name?.trim() || null,
      is_specialist: typeof is_specialist === "boolean" ? is_specialist : null,
      contact_email: contact_email?.trim() || null,
      website_url: website_url?.trim() || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 이름이나 별칭이 바뀌면 과거 기록의 '노출' 판정을 새 이름으로 다시 매긴다 (AI 호출 없음)
  const nameChanged = before && before.name !== data.name;
  const aliasesChanged =
    parsedAliases !== undefined && JSON.stringify(before?.aliases ?? []) !== JSON.stringify(parsedAliases);
  if (nameChanged || aliasesChanged) {
    try {
      await rejudgeClient(supabase, data);
    } catch (err) {
      console.error("[clients] 재판정 실패", err);
    }
  }

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

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
