import "server-only";
import type { ClientReportData } from "./reportData";

const CHATGPT = "#2a78d6";
const GEMINI = "#1baf7a";
const INK = "#16202c";
const MUTED = "#8b95a3";
const LINE = "#e8ebef";
const WARN = "#b45309";
const WARN_BG = "#fdf3e3";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function pct(n: number | null) {
  return n === null ? "-" : `${n}%`;
}

const PROVIDER_LABEL: Record<string, string> = { chatgpt: "ChatGPT", gemini: "Gemini" };
const PROVIDER_COLOR: Record<string, string> = { chatgpt: CHATGPT, gemini: GEMINI };
const PROVIDER_BG: Record<string, string> = { chatgpt: "#eaf2fc", gemini: "#e8f8f1" };

export function renderReportEmail(data: ClientReportData): { subject: string; html: string } {
  const { client, selfExposure, competitorTop5, unexposedRecent, unexposedCount, weeklyTrend } = data;
  const selfRate = selfExposure.total === 0 ? 0 : Math.round((selfExposure.count / selfExposure.total) * 100);
  const period =
    weeklyTrend.length > 0
      ? `${fmtDate(weeklyTrend[0].createdAt)} ~ ${fmtDate(weeklyTrend[weeklyTrend.length - 1].createdAt)}`
      : "최근 7일";

  const metaLine = [client.department, client.region].filter(Boolean).join(" · ");
  const competitorLabel = client.client_type === "business" ? "경쟁업체" : "경쟁병원";

  const trendRows = weeklyTrend
    .map(
      (t) => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid ${LINE};color:${MUTED};font-size:12px;">${fmtDate(t.createdAt)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid ${LINE};color:${CHATGPT};font-size:13px;text-align:right;">${pct(t.chatgptRate)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid ${LINE};color:${GEMINI};font-size:13px;text-align:right;">${pct(t.geminiRate)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid ${LINE};color:${INK};font-size:13px;text-align:right;font-weight:600;">${pct(t.overallRate)}</td>
      </tr>`
    )
    .join("");

  const competitorRows = competitorTop5
    .map(
      (c, i) => `
      <tr>
        <td style="padding:9px 6px;border-bottom:1px solid ${LINE};font-size:13px;color:${INK};">${i + 1}. ${c.name}</td>
        <td style="padding:9px 6px;border-bottom:1px solid ${LINE};font-size:12.5px;color:${CHATGPT};text-align:right;">${c.chatgpt}</td>
        <td style="padding:9px 6px;border-bottom:1px solid ${LINE};font-size:12.5px;color:${GEMINI};text-align:right;">${c.gemini}</td>
        <td style="padding:9px 6px;border-bottom:1px solid ${LINE};font-size:12.5px;color:${MUTED};text-align:right;">총 ${c.total}회</td>
      </tr>`
    )
    .join("");

  const unexposedItems = unexposedRecent
    .map(
      (u) => `
      <div style="border:1px solid ${LINE};border-left:3px solid ${WARN};background:${WARN_BG};border-radius:8px;padding:10px 12px;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">
          <span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;background:${PROVIDER_BG[u.provider]};color:${PROVIDER_COLOR[u.provider]};">${PROVIDER_LABEL[u.provider]}</span>
          <span style="margin-left:6px;color:${INK};">${u.keyword}</span>
        </div>
        <div style="font-size:12px;color:${MUTED};">
          ${u.competitors.length > 0 ? `대신 언급된 ${competitorLabel}: ${u.competitors.slice(0, 5).join(", ")}${u.competitors.length > 5 ? " 외" : ""}` : `${competitorLabel} 언급 없이 미노출`}
        </div>
      </div>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${client.name} AI 노출 주간 리포트</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic','Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:28px 20px 40px;">

    <div style="border-bottom:2px solid ${INK};padding-bottom:16px;margin-bottom:22px;">
      <div style="font-size:12px;font-weight:600;color:${MUTED};letter-spacing:0.02em;margin-bottom:6px;">AI analytics</div>
      <div style="font-size:20px;font-weight:800;color:${INK};">AI 노출 주간 리포트</div>
      <div style="font-size:13px;color:${MUTED};margin-top:8px;">${client.name}${metaLine ? ` · ${metaLine}` : ""} · ${period}</div>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="border:1px solid ${LINE};border-radius:10px;padding:16px;" width="48%">
          <div style="font-size:12px;color:${MUTED};margin-bottom:6px;">${client.name} 노출 빈도</div>
          <div style="font-size:26px;font-weight:700;color:${INK};">${selfExposure.count}회 <span style="font-size:13px;font-weight:400;color:${MUTED};">(${selfRate}%)</span></div>
          <div style="font-size:12px;color:${MUTED};margin-top:6px;">
            <span style="color:${CHATGPT};">ChatGPT ${selfExposure.chatgpt.count}/${selfExposure.chatgpt.total}회</span> ·
            <span style="color:${GEMINI};">Gemini ${selfExposure.gemini.count}/${selfExposure.gemini.total}회</span>
          </div>
        </td>
        <td width="4%"></td>
        <td style="border:1px solid ${LINE};border-radius:10px;padding:16px;" width="48%">
          <div style="font-size:12px;color:${MUTED};margin-bottom:6px;">미노출 키워드 (최근 3회 실행)</div>
          <div style="font-size:26px;font-weight:700;color:${INK};">${unexposedCount}건</div>
          <div style="font-size:12px;color:${MUTED};margin-top:6px;">전체 ${selfExposure.total}건 기준</div>
        </td>
      </tr>
    </table>

    ${
      weeklyTrend.length > 0
        ? `
    <div style="margin-bottom:24px;">
      <div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:10px;">노출률 추이</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 6px 8px;font-size:11px;color:${MUTED};text-transform:uppercase;">날짜</td>
          <td style="padding:0 6px 8px;font-size:11px;color:${MUTED};text-align:right;">ChatGPT</td>
          <td style="padding:0 6px 8px;font-size:11px;color:${MUTED};text-align:right;">Gemini</td>
          <td style="padding:0 6px 8px;font-size:11px;color:${MUTED};text-align:right;">전체</td>
        </tr>
        ${trendRows}
      </table>
    </div>`
        : ""
    }

    ${
      competitorTop5.length > 0
        ? `
    <div style="margin-bottom:24px;">
      <div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:10px;">${competitorLabel} 노출 빈도 TOP 5</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${competitorRows}
      </table>
    </div>`
        : ""
    }

    ${
      unexposedRecent.length > 0
        ? `
    <div style="margin-bottom:24px;">
      <div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:10px;">이번 주 미노출 상세</div>
      ${unexposedItems}
    </div>`
        : ""
    }

    <div style="border-top:1px solid ${LINE};padding-top:16px;font-size:11.5px;color:${MUTED};">
      AI analytics 대시보드에서 발송된 리포트입니다.
    </div>
  </div>
</body>
</html>`;

  return { subject: `[AI analytics] ${client.name} 주간 리포트 (${period})`, html };
}
