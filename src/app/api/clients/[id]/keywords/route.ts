import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";
import { selectActiveKeywords } from "@/lib/keywords";
import { ensureVariants } from "@/lib/keywordVariants";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 새 질문에 같은 의도의 다른 표현을 만들어 붙인 뒤, 저장된 행을 다시 읽어 돌려준다 */
async function withVariants(supabase: SupabaseClient, clientId: string, rows: { id: string; text: string; variants?: unknown }[]) {
  const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
  await ensureVariants(supabase, rows, client ?? {});
  const { data } = await supabase.from("keywords").select("*").in("id", rows.map((r) => r.id));
  const byId = new Map((data ?? []).map((r) => [r.id, r]));
  return rows.map((r) => byId.get(r.id) ?? r);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await assertClientAccess(id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();
  const { data, error } = await selectActiveKeywords(supabase, id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await assertClientAccess(id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const body = await request.json();
  const supabase = getSupabaseServerClient();

  if (Array.isArray(body.texts)) {
    const texts = body.texts
      .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t: string) => t.trim());
    if (texts.length === 0) {
      return NextResponse.json({ error: "등록할 질문이 없습니다." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("keywords")
      .insert(texts.map((text: string) => ({ client_id: id, text })))
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(await withVariants(supabase, id, data ?? []));
  }

  const { text } = body;
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "질문을 입력하세요." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("keywords")
    .insert({ client_id: id, text: text.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const [withNote] = await withVariants(supabase, id, [data]);
  return NextResponse.json(withNote);
}
