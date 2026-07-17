import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runMonitoringForClient } from "@/lib/runMonitoringForClient";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();

  const { data: clients, error: clientsError } = await supabase.from("clients").select("id, name");
  if (clientsError) {
    return NextResponse.json({ error: clientsError.message }, { status: 500 });
  }

  const summary: { clientId: string; clientName: string; status: string }[] = [];

  for (const client of clients ?? []) {
    try {
      const result = await runMonitoringForClient(supabase, client);
      summary.push({
        clientId: client.id,
        clientName: client.name,
        status: result ? `완료 (${result.results.length}건)` : "건너뜀 (등록된 질문 없음)",
      });
    } catch (err) {
      summary.push({
        clientId: client.id,
        clientName: client.name,
        status: `실패: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), summary });
}
