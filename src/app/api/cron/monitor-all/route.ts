import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runMonitoringForClient } from "@/lib/runMonitoringForClient";
import { sendClientReport } from "@/lib/reportDelivery";
import { withPdfRenderer, type PdfRenderer } from "@/lib/pdf";
import { clientIntervalDays, minRunGapMs } from "@/lib/schedule";

export const maxDuration = 300;

/** 새 클라이언트 모니터링을 시작하지 않는 시점. 이후엔 남은 클라이언트를 다음 날로 미룬다. */
const START_BUDGET_MS = 150_000;
/** 각 클라이언트 실행 안에서 새 AI 호출을 끊는 시점. 뒤이은 리포트 발송 시간을 남겨 둔다. */
const CALL_BUDGET_MS = 200_000;
/** 이 시점이 지나면 남은 리포트 발송을 미룬다 (함수 실행 한도 300초) */
const REPORT_BUDGET_MS = 260_000;
/** 동시에 모니터링하는 클라이언트 수 */
const CLIENT_CONCURRENCY = 3;

/*
 * 자동 모니터링 주기: 계정 관리에서 정한 병원별 주기(clients.monitor_interval_days), 없으면 기본 7일.
 *
 * cron 표현식의 "N일마다" 문법은 매월 1일 기준으로 날짜를 맞추는 방식이라,
 * 월말과 다음 달 1일이 연달아 걸리고 병원마다 다르게 줄 수도 없습니다.
 * 그래서 cron은 매일 깨우고, 여기서 클라이언트별 마지막 실행 시각과 주기를 보고 건너뜁니다.
 * 화면의 '모니터링 실행' 버튼은 이 주기와 무관하게 언제든 돌릴 수 있습니다.
 */

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
    const intervalDays = clientIntervalDays(client);
    if (previous !== undefined && now - previous < minRunGapMs(intervalDays)) {
      const hours = Math.round((now - previous) / 3_600_000);
      summary.push({
        clientId: client.id,
        clientName: client.name,
        status: `건너뜀 (${hours}시간 전 실행 · ${intervalDays}일 주기)`,
      });
    } else {
      due.push(client);
    }
  }

  // 이번 실행에서 체크를 마친 병원 (리포트 자동 발송 대상)
  const completed = new Set<string>();

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
      if (result) completed.add(client.id);
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

  // 이번에 자동 체크를 마친 병원 중 '체크 후 리포트 발송'을 켠 곳에 PDF 리포트를 보낸다
  const reportSummary: { clientId: string; clientName: string; status: string }[] = [];
  const toSend = (clients ?? []).filter((c) => completed.has(c.id) && c.auto_report_enabled);

  async function deliver(render: PdfRenderer) {
    for (const client of toSend) {
      if (!client.contact_email) {
        reportSummary.push({ clientId: client.id, clientName: client.name, status: "건너뜀 (수신 이메일 없음)" });
        continue;
      }
      if (Date.now() - startedAt > REPORT_BUDGET_MS) {
        reportSummary.push({
          clientId: client.id,
          clientName: client.name,
          status: "미룸 (실행 시간 한도 · 계정 관리의 '지금 발송'으로 보내세요)",
        });
        continue;
      }
      try {
        const result = await sendClientReport(client.id, { generatePlan: false, render });
        reportSummary.push({
          clientId: client.id,
          clientName: client.name,
          status: `발송 완료 (${result.sentTo}${result.attached ? " · PDF 첨부" : " · PDF 없이 본문으로"})`,
        });
      } catch (err) {
        reportSummary.push({
          clientId: client.id,
          clientName: client.name,
          status: `발송 실패: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  if (toSend.length) {
    try {
      await withPdfRenderer(deliver);
    } catch (err) {
      // 크롬을 띄우지 못했으면 PDF 없이 본문에 리포트 전체를 실어 보낸다
      if (reportSummary.length === 0) {
        await deliver(async () => {
          throw err;
        });
      }
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), summary, reportSummary });
}
