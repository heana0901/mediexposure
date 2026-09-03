import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: keyword } = await supabase.from("keywords").select("client_id").eq("id", id).maybeSingle();
  if (!keyword) return NextResponse.json({ error: "질문을 찾을 수 없습니다." }, { status: 404 });

  const access = await assertClientAccess(keyword.client_id);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  // 진짜로 지우면 이 질문으로 쌓아 온 모니터링 결과까지 함께 사라진다.
  // 지운 것으로 표시만 해서 목록과 다음 모니터링에서 빠지게 하고, 과거 기록은 남긴다.
  const { error } = await supabase
    .from("keywords")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    // 013 마이그레이션 전이라면 삭제를 막는다. 예전처럼 지우면 기록이 날아간다.
    if (error.message.includes("deleted_at")) {
      return NextResponse.json(
        {
          error:
            "질문 삭제 준비가 아직 끝나지 않았습니다. Supabase에서 013 마이그레이션을 실행한 뒤 다시 시도해 주세요.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
