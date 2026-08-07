import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runMonitoringForClient } from "@/lib/runMonitoringForClient";
import { getClientReportData } from "@/lib/reportData";
import { renderReportEmail } from "@/lib/emailTemplate";
import { sendReportEmail } from "@/lib/email";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, contact_email, auto_report_enabled, auto_report_day");
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

  // KST 기준 오늘 요일(0=일 ~ 6=토)에 자동 발송이 예약된 병원에 리포트 발송
  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
  const reportSummary: { clientId: string; clientName: string; status: string }[] = [];

  for (const client of clients ?? []) {
    if (!client.auto_report_enabled || client.auto_report_day !== todayKst) continue;
    if (!client.contact_email) {
      reportSummary.push({ clientId: client.id, clientName: client.name, status: "건너뜀 (수신 이메일 없음)" });
      continue;
    }
    try {
      const data = await getClientReportData(client.id);
      const { subject, html } = renderReportEmail(data);
      await sendReportEmail(client.contact_email, subject, html);
      reportSummary.push({ clientId: client.id, clientName: client.name, status: `발송 완료 (${client.contact_email})` });
    } catch (err) {
      reportSummary.push({
        clientId: client.id,
        clientName: client.name,
        status: `발송 실패: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), summary, reportSummary });
}
