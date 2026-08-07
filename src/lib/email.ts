import "server-only";
import { Resend } from "resend";

export async function sendReportEmail(to: string, subject: string, html: string) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL || "Medi-Exposure <onboarding@resend.dev>";

  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) throw new Error(error.message);
}
