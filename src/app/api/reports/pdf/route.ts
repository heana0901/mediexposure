import { NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/dal";
import { buildClientReportPdf } from "@/lib/reportDelivery";

/** 콘텐츠 처방을 새로 만들고(AI 호출) PDF를 그리느라(처음엔 크롬 내려받기) 시간이 걸릴 수 있다 */
export const maxDuration = 180;

/** 메일에 첨부하는 것과 같은 리포트 PDF */
export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId가 필요합니다." }, { status: 400 });

  const access = await assertClientAccess(clientId);
  if (!access.ok) return NextResponse.json({ error: "권한이 없습니다." }, { status: access.status });

  try {
    const { pdf, fileName } = await buildClientReportPdf(clientId);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PDF를 만들지 못했습니다." }, { status: 500 });
  }
}
