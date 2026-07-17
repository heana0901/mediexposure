import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runMonitoringForClient } from "@/lib/runMonitoringForClient";

export async function POST(request: Request) {
  const { clientId } = await request.json();
  if (!clientId) {
    return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });
  }

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
    const result = await runMonitoringForClient(supabase, client);
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
