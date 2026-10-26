import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runMonitoringForClient } from "@/lib/runMonitoringForClient";
import { sendClientReport } from "@/lib/reportDelivery";
import { withPdfRenderer, type PdfRenderer } from "@/lib/pdf";
import { clientIntervalDays, minRunGapMs } from "@/lib/schedule";

export const maxDuration = 300;

/**
 * 시간 배분 (함수 실행 한도 300초)
 * ChatGPT(gpt-5.5)는 한 번 묻는 데 30초~2분이 걸려서, 병원을 한 곳씩 차례로 돌리고
 * 끝난 병원의 리포트를 바로 보낸 뒤 시간이 넉넉할 때만 다음 병원을 시작한다.
 * 시작하지 못한 병원은 같은 날 다음 자동 실행(vercel.json의 시간대)에서 먼저 처리된다.
 */
/** 이 시점이 지나면 새 병원을 시작하지 않는다 */
const START_BUDGET_MS = 60_000;
/** 새 AI 호출을 시작하지 않는 시점: 병원 시작 후 120초, 전체 170초 중 이른 쪽 */
const CLIENT_CALL_BUDGET_MS = 120_000;
const CALL_BUDGET_MS = 170_000;
/** 답을 기다리던 호출도 끊는 시점: 병원 시작 후 180초, 전체 220초 중 이른 쪽 */
const CLIENT_ABORT_MS = 180_000;
const ABORT_MS = 220_000;
/** 이 시점이 지나면 리포트 발송을 미룬다 */
const REPORT_BUDGET_MS = 260_000;

/*
 * 자동 모니터링 주기: 계정 관리에서 정한 병원별 주기(clients.monitor_interval_days), 없으면 기본 7일.
 *
 * cron 표현식의 "N일마다" 문법은 매월 1일 기준으로 날짜를 맞추는 방식이라,
 * 월말과 다음 달 1일이 연달아 걸리고 병원마다 다르게 줄 수도 없습니다.
 * 그래서 cron은 하루 세 번(밀린 병원 처리용) 깨우고, 여기서 클라이언트별 마지막 실행 시각과 주기를 보고 건너뜁니다.
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

  // 오래 안 돌린 클라이언트부터 처리한다. 시간이 모자라 밀린 클라이언트가 다음 자동 실행 때 먼저 돌게 하기 위해서다.
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

  const reportSummary: { clientId: string; clientName: string; status: string }[] = [];

  /** 체크를 마친 병원에 PDF 리포트를 보낸다. 크롬을 못 띄우면 PDF 없이 본문에 실어 보낸다. */
  async function sendReport(client: (typeof due)[number]) {
    const note = (status: string) => reportSummary.push({ clientId: client.id, clientName: client.name, status });
    if (!client.contact_email) return note("건너뜀 (수신 이메일 없음)");
    if (Date.now() - startedAt > REPORT_BUDGET_MS) {
      return note("미룸 (실행 시간 한도 · 계정 관리의 '지금 발송'으로 보내세요)");
    }

    const deliver = async (render: PdfRenderer) => {
      try {
        const result = await sendClientReport(client.id, { generatePlan: false, render });
        note(`발송 완료 (${result.sentTo}${result.attached ? " · PDF 첨부" : " · PDF 없이 본문으로"})`);
      } catch (err) {
        note(`발송 실패: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    let delivered = false;
    try {
      await withPdfRenderer(async (render) => {
        await deliver(render);
        delivered = true;
      });
    } catch (err) {
      if (!delivered) {
        await deliver(async () => {
          throw err;
        });
      }
    }
  }

  // 병원을 한 곳씩 차례로 돌린다(동시에 돌리면 ChatGPT 분당 한도와 시간 한도에 걸린다)
  for (const client of due) {
    const clientStart = Date.now();
    if (clientStart - startedAt > START_BUDGET_MS) {
      summary.push({
        clientId: client.id,
        clientName: client.name,
        status: "미룸 (실행 시간 한도 · 다음 자동 실행 때 먼저 처리)",
      });
      continue;
    }

    let completed = false;
    try {
      const result = await runMonitoringForClient(supabase, client, {
        deadline: Math.min(clientStart + CLIENT_CALL_BUDGET_MS, startedAt + CALL_BUDGET_MS),
        abortAt: Math.min(clientStart + CLIENT_ABORT_MS, startedAt + ABORT_MS),
      });
      completed = Boolean(result);
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

    // '체크 후 리포트 발송'을 켠 병원이면 다음 병원으로 넘어가기 전에 바로 보낸다
    if (completed && client.auto_report_enabled) await sendReport(client);
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), summary, reportSummary });
}
