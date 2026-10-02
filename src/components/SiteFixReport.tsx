"use client";

import { createRoot } from "react-dom/client";
import { AXIS_META, AXIS_ORDER, type SiteDiagnosis } from "@/lib/diagnose-shared";
import { buildFixItems, extraRecommendations, type FixContext, type FixItem } from "@/lib/siteFixGuide";

/**
 * 홈페이지 제작·관리 담당자에게 넘기는 '홈페이지 개선 작업 요청서' PDF.
 * 항목마다 블록으로 그려 페이지가 항목 중간에서 잘리지 않게 한다.
 */
const INK = "#16202c";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const FONT = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', sans-serif";

const STATUS = {
  fail: { label: "꼭 고칠 것", color: "#dc2626", bg: "#fef2f2" },
  warn: { label: "손볼 곳", color: "#d97706", bg: "#fffbeb" },
} as const;

function Block({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div data-pdf-block style={{ padding: "14px 0", ...style }}>
      {children}
    </div>
  );
}

function Code({ code }: { code: string }) {
  return (
    <pre
      style={{
        margin: "8px 0 0",
        padding: "10px 12px",
        background: "#f6f8fa",
        border: `1px solid ${LINE}`,
        borderRadius: 6,
        fontFamily: "Consolas, 'D2Coding', 'Courier New', monospace",
        fontSize: 10.5,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        color: "#111827",
      }}
    >
      {code}
    </pre>
  );
}

function ItemBlock({ item, index }: { item: FixItem; index: number }) {
  const status = STATUS[item.check.status as "fail" | "warn"];
  return (
    <Block style={{ borderTop: `1px solid ${LINE}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{index}.</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{item.check.name}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: status.color, background: status.bg, borderRadius: 4, padding: "2px 7px" }}>
          {status.label}
        </span>
        <span style={{ fontSize: 11, color: MUTED, border: `1px solid ${LINE}`, borderRadius: 4, padding: "1px 6px" }}>
          {item.axisLabel}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#2563eb", fontWeight: 700 }}>고치면 최대 +{item.gain}점</span>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>
        <b style={{ color: INK }}>현재 상태</b> · {item.check.detail}
      </div>
      {item.why && (
        <div style={{ fontSize: 12, color: "#374151", marginBottom: 6, lineHeight: 1.6 }}>
          <b style={{ color: INK }}>왜 중요한가요</b> · {item.why}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
        <b style={{ color: INK }}>작업 방법</b>
        <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {item.steps.map((step, i) => (
            <li key={i} style={{ marginBottom: 2 }}>
              {step}
            </li>
          ))}
        </ol>
      </div>
      {item.code && <Code code={item.code} />}
      <div style={{ fontSize: 11.5, color: "#065f46", background: "#ecfdf5", borderRadius: 6, padding: "6px 10px", marginTop: 8 }}>
        <b>완료 확인</b> · {item.verify}
      </div>
    </Block>
  );
}

function ReportBody({ diagnosis, ctx, auditedAt }: { diagnosis: SiteDiagnosis; ctx: FixContext; auditedAt: string }) {
  const items = buildFixItems(diagnosis, ctx);
  const fails = items.filter((i) => i.check.status === "fail").length;
  const warns = items.length - fails;
  const totalGain = Math.min(100 - diagnosis.score, Math.round(items.reduce((s, i) => s + i.gain, 0)));
  const extras = extraRecommendations(ctx);
  const date = new Date(auditedAt).toLocaleDateString("ko-KR");

  return (
    <div style={{ width: 760, padding: "8px 40px", background: "#fff", fontFamily: FONT, color: "#374151" }}>
      <Block>
        <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>AI analytics · 홈페이지 개선 작업 요청서</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: INK, marginTop: 6 }}>{ctx.hospitalName} 홈페이지 수정 요청</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            대상: {diagnosis.finalUrl || diagnosis.url} · 진단일 {date}
          </div>
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: "14px 0 0" }}>
          이 문서는 홈페이지 제작·관리 담당자께 드리는 작업 목록입니다. 검색엔진과 생성형 AI(ChatGPT·Gemini·Perplexity
          등)가 홈페이지를 제대로 읽고 병원을 정확하게 소개·인용할 수 있도록, 서버가 처음 보내는 HTML을 기준으로 25개
          항목을 점검했습니다. 위에서부터 순서대로 작업해 주시면 효과가 큰 것부터 반영됩니다.
        </p>
      </Block>

      <Block>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: MUTED }}>현재 종합 점수</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: INK }}>
              {diagnosis.score}점 <span style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>({diagnosis.grade})</span>
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>
              {AXIS_ORDER.map((axis) => {
                const a = diagnosis.axes.find((x) => x.axis === axis);
                return a ? `${AXIS_META[axis].short} ${a.score}` : null;
              })
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: MUTED }}>작업 항목</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: INK }}>{items.length}개</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>
              꼭 고칠 것 {fails}개 · 손볼 곳 {warns}개
            </div>
          </div>
          <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: MUTED }}>모두 반영하면</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#2563eb" }}>최대 {diagnosis.score + totalGain}점</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>+{totalGain}점</div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10, lineHeight: 1.6 }}>
          예시 코드의 {"{{ }}"} 부분은 실제 값으로 바꿔 주세요. 확인되지 않은 정보(전화번호·채널 주소 등)는 비워 두었습니다.
        </div>
      </Block>

      {items.map((item, i) => (
        <ItemBlock key={`${item.check.id}-${i}`} item={item} index={i + 1} />
      ))}

      <Block style={{ borderTop: `2px solid ${INK}`, marginTop: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: INK }}>추가 권장 작업</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>점수 항목은 아니지만 AI 검색 노출에 도움이 되는 작업입니다.</div>
      </Block>
      {extras.map((extra) => (
        <Block key={extra.title} style={{ borderTop: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 6 }}>{extra.title}</div>
          <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 4 }}>{extra.why}</div>
          <ol style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
            {extra.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {extra.code && <Code code={extra.code} />}
        </Block>
      ))}

      <Block style={{ borderTop: `1px solid ${LINE}` }}>
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.7 }}>
          작업을 마치면 알려 주세요. 같은 기준으로 다시 진단해 점수 변화와 바뀐 항목을 확인해 드립니다. 이 진단은 첫 화면 한
          장을 기준으로 하므로, 진료 페이지에도 같은 원칙(제목·설명·질문형 소제목·텍스트 본문·구조화 데이터)을 적용해 주세요.
        </div>
      </Block>
    </div>
  );
}

/** 요청서를 그려 A4 PDF로 저장한다. 블록 단위로 페이지를 나누고, 한 블록이 한 페이지보다 길면 잘라 넣는다. */
export async function downloadSiteFixPdf(diagnosis: SiteDiagnosis, ctx: FixContext, auditedAt: string | null) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    root.render(<ReportBody diagnosis={diagnosis} ctx={ctx} auditedAt={auditedAt ?? new Date().toISOString()} />);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
    const pdf = new jsPDF("p", "mm", "a4");
    const PAGE_W = 210;
    const PAGE_H = 297;
    const MARGIN = 10;
    const contentW = PAGE_W - MARGIN * 2;
    const usableH = PAGE_H - MARGIN * 2;
    let y = MARGIN;

    const blocks = Array.from(host.querySelectorAll<HTMLElement>("[data-pdf-block]"));
    for (const block of blocks) {
      const canvas = await html2canvas(block, { scale: 2, backgroundColor: "#ffffff" });
      const mmPerPx = contentW / canvas.width;
      const blockH = canvas.height * mmPerPx;

      if (blockH <= usableH) {
        if (y + blockH > PAGE_H - MARGIN) {
          pdf.addPage();
          y = MARGIN;
        }
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", MARGIN, y, contentW, blockH);
        y += blockH;
        continue;
      }

      // 한 페이지보다 긴 블록(긴 코드 예시)은 페이지 높이만큼 잘라 이어 붙인다
      const sliceH = Math.floor(usableH / mmPerPx);
      for (let offset = 0; offset < canvas.height; offset += sliceH) {
        const part = document.createElement("canvas");
        part.width = canvas.width;
        part.height = Math.min(sliceH, canvas.height - offset);
        part.getContext("2d")!.drawImage(canvas, 0, offset, canvas.width, part.height, 0, 0, canvas.width, part.height);
        if (y > MARGIN) {
          pdf.addPage();
          y = MARGIN;
        }
        const partH = part.height * mmPerPx;
        pdf.addImage(part.toDataURL("image/png"), "PNG", MARGIN, y, contentW, partH);
        y += partH;
      }
    }

    pdf.save(`${ctx.hospitalName}_홈페이지_수정요청서.pdf`);
  } finally {
    root.unmount();
    document.body.removeChild(host);
  }
}
