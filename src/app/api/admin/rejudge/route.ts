import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { verifySession } from "@/lib/dal";
import { rejudgeClient, type RejudgeSummary } from "@/lib/rejudge";

export const maxDuration = 300;

/**
 * 저장된 모든(또는 한 클라이언트의) 모니터링 결과를 지금의 판정 규칙으로 다시 매긴다. 관리자 전용.
 * AI를 다시 부르지 않으므로 비용이 들지 않는다. 016 마이그레이션이 판정값을 백업해 둔다.
 */
export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const clientId = typeof body.clientId === "string" ? body.clientId : null;

  const supabase = getSupabaseServerClient();
  let query = supabase.from("clients").select("*");
  if (clientId) query = query.eq("id", clientId);
  const { data: clients, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary: (RejudgeSummary & { clientName: string })[] = [];
  for (const client of clients ?? []) {
    try {
      summary.push({ clientName: client.name, ...(await rejudgeClient(supabase, client)) });
    } catch (err) {
      return NextResponse.json(
        { error: `${client.name}: ${err instanceof Error ? err.message : String(err)}`, summary },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ summary });
}
