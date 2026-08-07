import { NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/dal";
import { getClientReportData } from "@/lib/reportData";
import { renderReportEmail } from "@/lib/emailTemplate";
import { sendReportEmail } from "@/lib/email";

export async function POST(request: Request) {
  const { clientId } = await request.json();
  if (!clientId) return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  try {
    const data = await getClientReportData(clientId);

    if (!data.client.contact_email) {
      return NextResponse.json(
        { error: "이 병원에 등록된 수신 이메일이 없습니다. '정보 수정'에서 리포트 수신 이메일을 등록해주세요." },
        { status: 400 }
      );
    }

    const { subject, html } = renderReportEmail(data);
    await sendReportEmail(data.client.contact_email, subject, html);
    return NextResponse.json({ ok: true, sentTo: data.client.contact_email });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "발송 중 오류가 발생했습니다." }, { status: 500 });
  }
}
