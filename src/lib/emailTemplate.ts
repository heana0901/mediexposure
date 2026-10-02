import "server-only";
import type { ClientReportData } from "./reportData";
import { REPORT_SECTIONS, type ReportSection } from "./reportSections";
import { PROVIDER_META } from "./providers";
import { marginOfError, percent } from "./stats";
import type { ContentPrescription, ExposureTally } from "./types";
import {
  DEVELOPER_PDF_NOTE,
  MEDICAL_AD_NOTE,
  NO_AUDIT_NOTE,
  PLAN_NOTE,
  QUESTION_TABLE_NOTE,
  rankLabel,
  scoreDelta,
  volumeLabel,
} from "./reportText";

/** AI 답변·웹 페이지 제목처럼 밖에서 온 글자를 HTML에 넣을 때 */
function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pctOf(tally: ExposureTally) {
  const value = percent(tally.count, tally.total);
  return value === null ? "-" : `${value}%`;
}
const INK = "#16202c";
const MUTED = "#8b95a3";
const LINE = "#e8ebef";
const WARN = "#b45309";
const ACCENT = "#2563eb";
const SOFT_BG = "#f6f8fb";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function pct(n: number | null) {
  return n === null ? "-" : `${n}%`;
}

/**
 * 리포트 HTML. 같은 내용으로 두 가지를 만든다.
 * - renderReportHtml: PDF로 만들 전체 리포트 (병원별로 고른 항목만)
 * - renderReportEmail: 메일 본문. PDF를 첨부하면 요약만, 첨부하지 못하면 전체를 본문에 싣는다.
 */
function buildReport(data: ClientReportData) {
  const { client, providers, selfExposure, competitorTop5, unexposedCount, weeklyTrend, metrics, method, demand, questions, contentPlan, siteAudit } =
    data;
  const selfRate = selfExposure.total === 0 ? 0 : Math.round((selfExposure.count / selfExposure.total) * 100);
  const selfMargin = marginOfError(selfExposure.count, selfExposure.total);
  const period =
    weeklyTrend.length > 0
      ? `${fmtDate(weeklyTrend[0].createdAt)} ~ ${fmtDate(weeklyTrend[weeklyTrend.length - 1].createdAt)}`
      : "최근 측정";

  const metaLine = [client.department, client.region].filter(Boolean).join(" · ");
  const competitorLabel = client.client_type === "business" ? "경쟁업체" : "경쟁병원";

  const trendRows = weeklyTrend
    .map(
      (t) => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid ${LINE};color:${MUTED};font-size:12px;">${fmtDate(t.createdAt)}</td>
        ${providers
          .map(
            (p) =>
              `<td style="padding:8px 6px;border-bottom:1px solid ${LINE};color:${PROVIDER_META[p].color};font-size:13px;text-align:right;">${pct(t.rates[p] ?? null)}</td>`
          )
          .join("")}
        <td style="padding:8px 6px;border-bottom:1px solid ${LINE};color:${INK};font-size:13px;text-align:right;font-weight:600;">${pct(t.overallRate)}</td>
      </tr>`
    )
    .join("");

  const competitorRows = competitorTop5
    .map(
      (c, i) => `
      <tr>
        <td style="padding:9px 6px;border-bottom:1px solid ${LINE};font-size:13px;color:${INK};">${i + 1}. ${esc(c.name)}</td>
        ${providers
          .map(
            (p) =>
              `<td style="padding:9px 6px;border-bottom:1px solid ${LINE};font-size:12.5px;color:${PROVIDER_META[p].color};text-align:right;">${c.counts[p] ?? 0}</td>`
          )
          .join("")}
        <td style="padding:9px 6px;border-bottom:1px solid ${LINE};font-size:12.5px;color:${MUTED};text-align:right;">총 ${c.total}회</td>
      </tr>`
    )
    .join("");

  const sectionTitle = (title: string, sub?: string) =>
    `<div style="font-size:15px;font-weight:700;color:${INK};">${title}</div>${sub ? `<div style="font-size:11.5px;color:${MUTED};margin:3px 0 0;">${sub}</div>` : ""}<div style="height:10px;"></div>`;
  const label = (text: string) => `<div style="font-size:11.5px;font-weight:700;color:${MUTED};margin:10px 0 4px;">${text}</div>`;
  const cell = `padding:8px 5px;border-bottom:1px solid ${LINE};font-size:12px;`;

  const questionRows = questions
    .map(
      (q) => `
      <tr>
        <td style="${cell}color:${INK};">${esc(q.text)}${q.rivals.length ? `<div style="font-size:11px;color:${MUTED};margin-top:2px;">대신 추천된 ${competitorLabel}: ${esc(q.rivals.join(", "))}</div>` : ""}</td>
        <td style="${cell}color:${MUTED};text-align:right;white-space:nowrap;">${volumeLabel(q)}</td>
        <td style="${cell}color:${INK};text-align:right;font-weight:600;white-space:nowrap;">${pctOf(q.tally)}<span style="font-weight:400;color:${MUTED};font-size:11px;"> (${q.tally.count}/${q.tally.total})</span></td>
        <td style="${cell}text-align:right;">${rankLabel(q.naver?.local)}</td>
        <td style="${cell}text-align:right;">${rankLabel(q.naver?.blog)}</td>
        <td style="${cell}text-align:right;">${rankLabel(q.naver?.web)}</td>
      </tr>`
    )
    .join("");

  const pageLink = (p: ContentPrescription["citedPages"][number]) => {
    const text = `${esc(p.host)}${p.title ? ` · ${esc(p.title)}` : ""}`;
    return p.url ? `<a href="${esc(p.url)}" style="color:#4b5563;">${text}</a>` : text;
  };

  const prescription = (item: ContentPrescription, index: number) => `
    <div class="keep" style="border:1px solid ${LINE};border-radius:10px;padding:16px;margin-bottom:12px;">
      <div style="font-size:14.5px;font-weight:700;color:${INK};">${index + 1}. ${esc(item.question)}</div>
      <div style="font-size:11.5px;color:${MUTED};margin-top:3px;">월 ${volumeLabel(item)} · AI 추천 ${item.tally.count}/${item.tally.total}회</div>
      <div style="font-size:13px;font-weight:600;color:${ACCENT};margin-top:8px;line-height:1.5;">→ ${esc(item.headline)}</div>
      <div style="font-size:12.5px;color:#4b5563;margin-top:6px;line-height:1.5;">밀리는 이유: ${esc(item.gap)}</div>
      ${
        item.competitors.length
          ? label(`AI가 대신 추천한 ${competitorLabel}`) +
            item.competitors
              .map(
                (c) =>
                  `<div style="font-size:12.5px;color:#4b5563;line-height:1.55;">· <b style="color:${INK};">${esc(c.name)}</b> (${c.count}번) — ${esc(c.why)}</div>`
              )
              .join("")
          : ""
      }
      ${label("AI가 근거로 읽은 페이지")}
      ${
        item.citedPages.length
          ? item.citedPages
              .map(
                (p) =>
                  `<div style="font-size:12.5px;color:#4b5563;line-height:1.55;word-break:break-all;">· ${pageLink(p)} (${p.count}번)</div>`
              )
              .join("")
          : `<div style="font-size:12.5px;color:${MUTED};">출처 없음</div>`
      }
      <div style="font-size:12px;color:${item.ownCited ? "#059669" : WARN};margin-top:4px;">우리 홈페이지 인용: ${item.ownCited}번</div>
      <div style="background:${SOFT_BG};border-radius:8px;padding:12px;margin-top:12px;">
        <div style="font-size:12px;font-weight:700;color:${INK};margin-bottom:6px;">만들 페이지 설계서</div>
        <div style="font-size:12.5px;color:${INK};line-height:1.6;"><b>제목</b> ${esc(item.page.title)}<br /><b>주소</b> ${esc(item.page.slug)}</div>
        ${label("첫 문단 (AI가 인용하기 좋은 답변형)")}
        <div style="font-size:12.5px;color:#374151;line-height:1.65;">${esc(item.page.summary)}</div>
        ${label("자주 묻는 질문(FAQ)")}
        ${item.page.faqs.map((f, i) => `<div style="font-size:12.5px;color:#374151;line-height:1.6;">Q${i + 1}. ${esc(f)}</div>`).join("")}
        ${label("꼭 넣을 정보")}
        ${item.page.mustHave.map((m) => `<div style="font-size:12.5px;color:#374151;line-height:1.6;">· ${esc(m)}</div>`).join("")}
      </div>
      ${item.cautions.length ? `<div style="font-size:11.5px;color:${WARN};margin-top:8px;line-height:1.5;">${item.cautions.map((c) => `⚠ ${esc(c)}`).join("<br />")}</div>` : ""}
    </div>`;

  const planSection =
    contentPlan && (contentPlan.items.length > 0 || contentPlan.note)
      ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle("콘텐츠 처방", PLAN_NOTE)}
      ${contentPlan.note ? `<div style="font-size:12.5px;color:${MUTED};">${esc(contentPlan.note)}</div>` : ""}
      ${contentPlan.items.map(prescription).join("")}
    </div>`
      : "";

  const fixLines = siteAudit
    ? siteAudit.fixes
        .map(
          (f) =>
            `<div style="font-size:12.5px;color:#4b5563;line-height:1.6;">· <b style="color:${f.status === "fail" ? "#dc2626" : "#d97706"};">${f.status === "fail" ? "꼭 고칠 것" : "손볼 곳"}</b> <b style="color:${INK};">${esc(f.name)}</b> (+${f.gain}점) — ${esc(f.why)}</div>`
        )
        .join("")
    : "";
  const delta = siteAudit ? scoreDelta(siteAudit.score, siteAudit.previousScore) : null;
  const auditBody = siteAudit
    ? `<div style="font-size:13px;color:${INK};">AI 친화 점수 <b>${siteAudit.score}점</b> (${siteAudit.grade}) · ${fmtDate(siteAudit.auditedAt)} 분석${delta ? `<span style="color:${MUTED};"> · ${delta}</span>` : ""}</div>
      ${fixLines ? label("먼저 고칠 것") + fixLines : ""}
      <div style="font-size:11.5px;color:${MUTED};margin-top:8px;">${DEVELOPER_PDF_NOTE}</div>`
    : `<div style="font-size:12.5px;color:${MUTED};">${NO_AUDIT_NOTE}</div>`;
  const auditSection = `
    <div class="keep" style="margin-bottom:24px;">
      ${sectionTitle("홈페이지 개선")}
      ${auditBody}
    </div>`;

  const has = (section: ReportSection) => data.sections.includes(section);

  const header = `
    <div style="border-bottom:2px solid ${INK};padding-bottom:16px;margin-bottom:22px;">
      <div style="font-size:12px;font-weight:600;color:${MUTED};letter-spacing:0.02em;margin-bottom:6px;">AI analytics</div>
      <div style="font-size:20px;font-weight:800;color:${INK};">AI 노출 리포트</div>
      <div style="font-size:13px;color:${MUTED};margin-top:8px;">${esc(client.name)}${metaLine ? ` · ${esc(metaLine)}` : ""} · ${period}</div>
    </div>`;

  const summaryCards = `
    <table class="keep" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="border:1px solid ${LINE};border-radius:10px;padding:16px;vertical-align:top;" width="48%">
          <div style="font-size:12px;color:${MUTED};margin-bottom:6px;">${esc(client.name)} AI 추천 확률</div>
          <div style="font-size:26px;font-weight:700;color:${INK};">${selfRate}%${selfMargin !== null ? `<span style="font-size:13px;font-weight:400;color:${MUTED};"> ±${selfMargin}%p</span>` : ""} <span style="font-size:13px;font-weight:400;color:${MUTED};">(${selfExposure.count}/${selfExposure.total}회)</span></div>
          <div style="font-size:12px;color:${MUTED};margin-top:6px;">
            ${providers
              .map((p) => {
                const tally = selfExposure.byProvider[p] ?? { count: 0, total: 0 };
                return `<span style="color:${PROVIDER_META[p].color};">${PROVIDER_META[p].label} ${tally.count}/${tally.total}회</span>`;
              })
              .join(" · ")}
          </div>
          <div style="font-size:12px;color:${MUTED};margin-top:6px;">점유율 ${pctOf(metrics.shareOfVoice)} · 1순위 추천 ${pctOf(metrics.firstPlace)} · 홈페이지 인용 ${pctOf(metrics.ownCitation)}</div>
          ${demand ? `<div style="font-size:12px;color:${ACCENT};margin-top:4px;">네이버 검색 수요 반영 ${demand.weightedRate}% (질문 합계 월 ${demand.totalVolume.toLocaleString()}회 검색)</div>` : ""}
        </td>
        <td width="4%"></td>
        <td style="border:1px solid ${LINE};border-radius:10px;padding:16px;vertical-align:top;" width="48%">
          <div style="font-size:12px;color:${MUTED};margin-bottom:6px;">미노출 (최근 3회 실행)</div>
          <div style="font-size:26px;font-weight:700;color:${INK};">${unexposedCount}건</div>
          <div style="font-size:12px;color:${MUTED};margin-top:6px;">전체 ${selfExposure.total}건 기준</div>
          ${siteAudit ? `<div style="font-size:12px;color:${MUTED};margin-top:6px;">홈페이지 AI 친화 점수 ${siteAudit.score}점(${siteAudit.grade})</div>` : ""}
        </td>
      </tr>
    </table>`;

  const questionSection = questions.length
    ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle("질문별 현황", QUESTION_TABLE_NOTE)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 5px 8px;font-size:11px;color:${MUTED};">질문</td>
          <td style="padding:0 5px 8px;font-size:11px;color:${MUTED};text-align:right;">월 검색량</td>
          <td style="padding:0 5px 8px;font-size:11px;color:${MUTED};text-align:right;">AI 추천</td>
          <td style="padding:0 5px 8px;font-size:11px;color:${MUTED};text-align:right;">플레이스</td>
          <td style="padding:0 5px 8px;font-size:11px;color:${MUTED};text-align:right;">블로그</td>
          <td style="padding:0 5px 8px;font-size:11px;color:${MUTED};text-align:right;">웹문서</td>
        </tr>
        ${questionRows}
      </table>
    </div>`
    : "";

  const trendSection = weeklyTrend.length
    ? `
    <div class="keep" style="margin-bottom:24px;">
      ${sectionTitle("노출률 추이")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 6px 8px;font-size:11px;color:${MUTED};">날짜</td>
          ${providers
            .map((p) => `<td style="padding:0 6px 8px;font-size:11px;color:${MUTED};text-align:right;">${PROVIDER_META[p].label}</td>`)
            .join("")}
          <td style="padding:0 6px 8px;font-size:11px;color:${MUTED};text-align:right;">전체</td>
        </tr>
        ${trendRows}
      </table>
    </div>`
    : "";

  const competitorSection = competitorTop5.length
    ? `
    <div class="keep" style="margin-bottom:24px;">
      ${sectionTitle(`${competitorLabel} 노출 빈도 TOP 5`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${competitorRows}
      </table>
    </div>`
    : "";

  const footer = `
    <div style="border-top:1px solid ${LINE};padding-top:16px;font-size:11.5px;color:${MUTED};line-height:1.6;">
      ${method ? `${method} ±는 95% 오차범위입니다.<br />` : ""}${has("competitors") && contentPlan && contentPlan.items.length ? `${MEDICAL_AD_NOTE}<br />` : ""}AI analytics 대시보드에서 발송된 리포트입니다.
    </div>`;

  const full = [
    header,
    has("exposure") ? summaryCards + questionSection : "",
    has("trends") ? trendSection : "",
    has("competitors") ? competitorSection + planSection : "",
    has("site") ? auditSection : "",
    footer,
  ].join("");

  const included = REPORT_SECTIONS.filter((section) => has(section.key));
  const summary = [
    header,
    has("exposure") ? summaryCards : "",
    `<div style="border:1px solid ${LINE};border-radius:10px;padding:16px;margin-bottom:24px;font-size:13px;color:${INK};line-height:1.7;">
      <b>첨부한 PDF 리포트</b>에 아래 내용이 들어 있습니다.<br />
      ${included.map((section) => `· <b>${section.label}</b> <span style="color:${MUTED};">${section.detail}</span>`).join("<br />")}
    </div>`,
    footer,
  ].join("");

  const subject = `[AI analytics] ${client.name} AI 노출 리포트 (${period})`;
  // 파일 이름에는 만든 날짜(한국 시간)를 붙인다: 박진영병원_AI노출리포트_20261002.pdf
  const stamp = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const fileName = `${client.name}_AI노출리포트_${stamp}.pdf`;
  return { subject, fileName, full, summary, title: `${client.name} AI 노출 리포트` };
}

function emailDocument(title: string, inner: string) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic','Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:28px 20px 40px;background:#ffffff;">
${inner}
  </div>
</body>
</html>`;
}

/** PDF로 만들 전체 리포트. 서버 크롬에는 한글 글꼴이 없어 웹폰트를 불러온다 */
export function renderReportHtml(data: ClientReportData): { html: string; fileName: string } {
  const { full, fileName, title } = buildReport(data);
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;800&display=block" />
<style>
  @page { size: A4; }
  body { margin: 0; font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #374151; }
  .keep { break-inside: avoid; page-break-inside: avoid; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  a { text-decoration: none; }
</style>
</head>
<body>
  <div style="padding:4px 6px;">
${full}
  </div>
</body>
</html>`;
  return { html, fileName };
}

/** 메일 본문. PDF를 첨부하면 요약만 싣고, 첨부하지 못했으면 전체를 싣는다 */
export function renderReportEmail(data: ClientReportData, { attached }: { attached: boolean }): { subject: string; html: string } {
  const { subject, full, summary, title } = buildReport(data);
  return { subject, html: emailDocument(title, attached ? summary : full) };
}
