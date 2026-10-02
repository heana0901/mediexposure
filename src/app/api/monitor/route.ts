import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runMonitoringForClient } from "@/lib/runMonitoringForClient";
import { assertClientAccess } from "@/lib/dal";

/**
 * AI 여러 곳에 질문마다 여러 번 묻기 때문에 시간이 걸린다.
 * Vercel(Fluid compute) 기본 한도인 300초까지 허용하고, 새 호출은 그보다 일찍 끊어
 * 이미 받은 답변은 반드시 저장되게 한다.
 */
export const maxDuration = 300;
const CALL_BUDGET_MS = 220_000;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const { clientId } = await request.json();
  if (!clientId) {
    return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });
  }

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "클라이언트를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const result = await runMonitoringForClient(supabase, client, { deadline: startedAt + CALL_BUDGET_MS });
    if (!result) {
      return NextResponse.json({ error: "등록된 모니터링 질문이 없습니다." }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
