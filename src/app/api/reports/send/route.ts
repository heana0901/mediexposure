import { NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/dal";
import { sendClientReport } from "@/lib/reportDelivery";

/** 콘텐츠 처방을 새로 만들고(AI 호출) PDF를 그리느라(처음엔 크롬 내려받기) 시간이 걸릴 수 있다 */
export const maxDuration = 180;

export async function POST(request: Request) {
  const { clientId } = await request.json();
  if (!clientId) return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  try {
    const result = await sendClientReport(clientId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "발송 중 오류가 발생했습니다." }, { status: 500 });
  }
}
