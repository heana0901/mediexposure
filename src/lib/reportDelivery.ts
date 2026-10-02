import "server-only";
import { getClientReportData } from "./reportData";
import { renderReportEmail, renderReportHtml } from "./emailTemplate";
import { sendReportEmail } from "./email";
import { htmlToPdf, type PdfRenderer } from "./pdf";

/**
 * 리포트를 PDF로 첨부해 병원 수신 이메일로 보낸다.
 * PDF를 만들지 못하면(크롬 내려받기 실패 등) 리포트 전체를 메일 본문에 실어 보낸다.
 */
export async function sendClientReport(
  clientId: string,
  { generatePlan = true, render }: { generatePlan?: boolean; render?: PdfRenderer } = {}
): Promise<{ sentTo: string; attached: boolean; pdfError: string | null }> {
  const data = await getClientReportData(clientId, { generatePlan });
  const to = data.client.contact_email;
  if (!to) throw new Error("이 클라이언트에 등록된 수신 이메일이 없습니다. '정보 수정'에서 리포트 수신 이메일을 등록해주세요.");

  const { html, fileName } = renderReportHtml(data);
  let pdf: Buffer | null = null;
  let pdfError: string | null = null;
  try {
    pdf = await (render ?? htmlToPdf)(html);
  } catch (err) {
    pdfError = err instanceof Error ? err.message : String(err);
    console.error("[report] PDF 생성 실패", err);
  }

  const { subject, html: body } = renderReportEmail(data, { attached: pdf !== null });
  await sendReportEmail(to, subject, body, pdf ? [{ filename: fileName, content: pdf, contentType: "application/pdf" }] : []);
  return { sentTo: to, attached: pdf !== null, pdfError };
}

/** 화면의 'PDF 다운로드'용 */
export async function buildClientReportPdf(clientId: string): Promise<{ pdf: Buffer; fileName: string }> {
  const data = await getClientReportData(clientId);
  const { html, fileName } = renderReportHtml(data);
  return { pdf: await htmlToPdf(html), fileName };
}
