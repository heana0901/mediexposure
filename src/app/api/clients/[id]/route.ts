import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess, verifySession } from "@/lib/dal";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await assertClientAccess(id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const { name, client_type, region, department, director_name, is_specialist, contact_email } =
    await request.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .update({
      name: name.trim(),
      client_type: client_type === "business" ? "business" : "hospital",
      region: region?.trim() || null,
      department: department?.trim() || null,
      director_name: director_name?.trim() || null,
      is_specialist: typeof is_specialist === "boolean" ? is_specialist : null,
      contact_email: contact_email?.trim() || null,
    })
    .eq("id", id)
    .select()
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

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
