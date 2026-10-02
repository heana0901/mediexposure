import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";
import { getContentPlan } from "@/lib/contentPlan";

export const maxDuration = 120;

/** 가장 최근 실행을 근거로 한 콘텐츠 처방. 처방이 최근 실행보다 오래됐으면 새로 만든다. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await assertClientAccess(id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) return NextResponse.json({ error: "클라이언트를 찾을 수 없습니다." }, { status: 404 });

  try {
    const plan = await getContentPlan(supabase, client, { generate: true });
    return NextResponse.json(plan ?? { generatedAt: null, runId: null, items: [], note: "아직 측정 결과가 없습니다." });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
