import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { assertClientAccess } from "@/lib/dal";
import { getClientReportData } from "@/lib/reportData";
import { renderReportEmail } from "@/lib/emailTemplate";
import { sendReportEmail } from "@/lib/email";

export async function POST(request: Request) {
  const { clientId } = await request.json();
  if (!clientId) return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  const supabase = getSupabaseServerClient();
  const { data: user } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", access.session.userId)
    .single();

  if (!user?.email) {
    return NextResponse.json(
      { error: "등록된 이메일이 없습니다. 계정 관리에서 이메일을 등록해주세요." },
      { status: 400 }
    );
  }

  try {
    const data = await getClientReportData(clientId);
    const { subject, html } = renderReportEmail(data);
    await sendReportEmail(user.email, subject, html);
    return NextResponse.json({ ok: true, sentTo: user.email });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "발송 중 오류가 발생했습니다." }, { status: 500 });
  }
}
