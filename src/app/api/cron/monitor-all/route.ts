import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runMonitoringForClient } from "@/lib/runMonitoringForClient";
import { getClientReportData } from "@/lib/reportData";
import { renderReportEmail } from "@/lib/emailTemplate";
import { sendReportEmail } from "@/lib/email";

export const maxDuration = 300;

/** 새 클라이언트 모니터링을 시작하지 않는 시점. 이후엔 남은 클라이언트를 다음 날로 미룬다. */
const START_BUDGET_MS = 150_000;
/** 각 클라이언트 실행 안에서 새 AI 호출을 끊는 시점. 뒤이은 리포트 발송 시간을 남겨 둔다. */
const CALL_BUDGET_MS = 200_000;
/** 동시에 모니터링하는 클라이언트 수 */
const CLIENT_CONCURRENCY = 3;

/**
 * 자동 모니터링 주기(일). 기본 2일에 한 번.
 *
 * cron 표현식의 "이틀마다" 문법은 날짜를 홀수일에 맞추는 방식이라,
 * 매월 31일 다음 1일이 연달아 걸립니다.
 * 그래서 cron은 매일 깨우고, 여기서 클라이언트별 마지막 실행 시각을 보고 건너뜁니다.
 * 화면의 '모니터링 실행' 버튼은 이 주기와 무관하게 언제든 돌릴 수 있습니다.
 */
const INTERVAL_DAYS = Number(process.env.MONITOR_INTERVAL_DAYS ?? 2);

/**
 * 마지막 실행이 이 시간보다 오래됐으면 다시 돌립니다.
 * 정확히 48시간으로 두면 cron 시각이 몇 초만 앞당겨져도 하루를 통째로 거르므로
 * 반나절(12시간)의 여유를 둡니다. 2일 주기면 36시간이 기준입니다.
 */
const MIN_GAP_MS = Math.max(INTERVAL_DAYS * 24 - 12, 1) * 60 * 60 * 1000;

/** 클라이언트별 마지막 모니터링 실행 시각 */
async function lastRunAtByClient(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  clientIds: string[]
): Promise<Map<string, number>> {
  const latest = new Map<string, number>();
  if (clientIds.length === 0) return latest;

  const { data } = await supabase
    .from("monitoring_runs")
    .select("client_id, created_at")
    .in("client_id", clientIds)
    .order("created_at", { ascending: false });

  for (const run of data ?? []) {
    if (!latest.has(run.client_id)) latest.set(run.client_id, Date.parse(run.created_at));
  }
  return latest;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("*");
  if (clientsError) {
    return NextResponse.json({ error: clientsError.message }, { status: 500 });
  }

  const summary: { clientId: string; clientName: string; status: string }[] = [];

  const now = Date.now();
  const lastRunAt = await lastRunAtByClient(supabase, (clients ?? []).map((c) => c.id));

  // 오래 안 돌린 클라이언트부터 처리한다. 시간이 모자라 밀린 클라이언트가 다음 날 먼저 돌게 하기 위해서다.
  const ordered = [...(clients ?? [])].sort(
    (a, b) => (lastRunAt.get(a.id) ?? 0) - (lastRunAt.get(b.id) ?? 0)
  );

  const due: typeof ordered = [];
  for (const client of ordered) {
    const previous = lastRunAt.get(client.id);
    if (previous !== undefined && now - previous < MIN_GAP_MS) {
      const hours = Math.round((now - previous) / 3_600_000);
      summary.push({
        clientId: client.id,
        clientName: client.name,
        status: `건너뜀 (${hours}시간 전 실행 · ${INTERVAL_DAYS}일 주기)`,
      });
    } else {
      due.push(client);
    }
  }

  async function monitorOne(client: (typeof due)[number]) {
    if (Date.now() - startedAt > START_BUDGET_MS) {
      summary.push({
        clientId: client.id,
        clientName: client.name,
        status: "미룸 (실행 시간 한도 · 다음 자동 실행 때 먼저 처리)",
      });
      return;
    }

    try {
      const result = await runMonitoringForClient(supabase, client, { deadline: startedAt + CALL_BUDGET_MS });
      summary.push({
        clientId: client.id,
        clientName: client.name,
        status: result
          ? `완료 (${result.results.length}건)${result.warnings.length ? ` · 경고: ${result.warnings.join(" / ")}` : ""}`
          : "건너뜀 (등록된 질문 없음)",
      });
    } catch (err) {
      summary.push({
        clientId: client.id,
        clientName: client.name,
        status: `실패: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 클라이언트 여러 곳을 동시에 돌려 한 번의 cron 안에 끝낸다
  const queue = [...due];
  await Promise.all(
    Array.from({ length: Math.min(CLIENT_CONCURRENCY, queue.length) }, async () => {
      for (let client = queue.shift(); client; client = queue.shift()) await monitorOne(client);
    })
  );

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
