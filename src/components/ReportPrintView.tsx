import type { ClientReportData } from "@/lib/reportData";

const CHATGPT_COLOR = "#2a78d6";
const GEMINI_COLOR = "#1baf7a";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function pct(n: number | null) {
  return n === null ? "-" : `${n}%`;
}

type Props = {
  data: ClientReportData;
};

export function ReportPrintView({ data }: Props) {
  const { client, selfExposure, competitorTop5, unexposedRecent, unexposedCount, weeklyTrend } = data;
  const selfRate = selfExposure.total === 0 ? 0 : Math.round((selfExposure.count / selfExposure.total) * 100);
  const period =
    weeklyTrend.length > 0
      ? `${fmtDate(weeklyTrend[0].createdAt)} ~ ${fmtDate(weeklyTrend[weeklyTrend.length - 1].createdAt)}`
      : "최근 7일";
  const metaLine = [client.department, client.region].filter(Boolean).join(" · ");
  const competitorLabel = client.client_type === "business" ? "경쟁업체" : "경쟁병원";

  return (
    <div
      style={{
        width: 760,
        padding: 40,
        background: "#ffffff",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', sans-serif",
        color: "#374151",
      }}
    >
      <div style={{ borderBottom: "2px solid #16202c", paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#8b95a3", marginBottom: 6 }}>
          Medi-Exposure
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#16202c" }}>AI 노출 주간 리포트</div>
        <div style={{ fontSize: 13, color: "#8b95a3", marginTop: 8 }}>
          {client.name}
          {metaLine ? ` · ${metaLine}` : ""} · {period}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1, border: "1px solid #e8ebef", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#8b95a3", marginBottom: 6 }}>{client.name} 노출 빈도</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#16202c" }}>
            {selfExposure.count}회{" "}
            <span style={{ fontSize: 13, fontWeight: 400, color: "#8b95a3" }}>({selfRate}%)</span>
          </div>
          <div style={{ fontSize: 12, color: "#8b95a3", marginTop: 6 }}>
            <span style={{ color: CHATGPT_COLOR }}>
              ChatGPT {selfExposure.chatgpt.count}/{selfExposure.chatgpt.total}회
            </span>{" "}
            ·{" "}
            <span style={{ color: GEMINI_COLOR }}>
              Gemini {selfExposure.gemini.count}/{selfExposure.gemini.total}회
            </span>
          </div>
        </div>
        <div style={{ flex: 1, border: "1px solid #e8ebef", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#8b95a3", marginBottom: 6 }}>미노출 키워드 (최근 3일)</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#16202c" }}>{unexposedCount}건</div>
          <div style={{ fontSize: 12, color: "#8b95a3", marginTop: 6 }}>
            전체 {selfExposure.total}건 기준
          </div>
        </div>
      </div>

      {weeklyTrend.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#16202c", marginBottom: 10 }}>
            노출률 추이
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <td style={{ padding: "0 6px 8px", fontSize: 11, color: "#8b95a3" }}>날짜</td>
                <td style={{ padding: "0 6px 8px", fontSize: 11, color: "#8b95a3", textAlign: "right" }}>
                  ChatGPT
                </td>
                <td style={{ padding: "0 6px 8px", fontSize: 11, color: "#8b95a3", textAlign: "right" }}>
                  Gemini
                </td>
                <td style={{ padding: "0 6px 8px", fontSize: 11, color: "#8b95a3", textAlign: "right" }}>
                  전체
                </td>
              </tr>
            </thead>
            <tbody>
              {weeklyTrend.map((t) => (
                <tr key={t.createdAt}>
                  <td style={{ padding: "8px 6px", borderBottom: "1px solid #e8ebef", color: "#8b95a3" }}>
                    {fmtDate(t.createdAt)}
                  </td>
                  <td
                    style={{
                      padding: "8px 6px",
                      borderBottom: "1px solid #e8ebef",
                      color: CHATGPT_COLOR,
                      textAlign: "right",
                    }}
                  >
                    {pct(t.chatgptRate)}
                  </td>
                  <td
                    style={{
                      padding: "8px 6px",
                      borderBottom: "1px solid #e8ebef",
                      color: GEMINI_COLOR,
                      textAlign: "right",
                    }}
                  >
                    {pct(t.geminiRate)}
                  </td>
                  <td
                    style={{
                      padding: "8px 6px",
                      borderBottom: "1px solid #e8ebef",
                      color: "#16202c",
                      textAlign: "right",
                      fontWeight: 600,
                    }}
                  >
                    {pct(t.overallRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {competitorTop5.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#16202c", marginBottom: 10 }}>
            {competitorLabel} 노출 빈도 TOP 5
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {competitorTop5.map((c, i) => (
                <tr key={c.name}>
                  <td style={{ padding: "9px 6px", borderBottom: "1px solid #e8ebef", color: "#16202c" }}>
                    {i + 1}. {c.name}
                  </td>
                  <td
                    style={{
                      padding: "9px 6px",
                      borderBottom: "1px solid #e8ebef",
                      color: CHATGPT_COLOR,
                      textAlign: "right",
                      fontSize: 12.5,
                    }}
                  >
                    {c.chatgpt}
                  </td>
                  <td
                    style={{
                      padding: "9px 6px",
                      borderBottom: "1px solid #e8ebef",
                      color: GEMINI_COLOR,
                      textAlign: "right",
                      fontSize: 12.5,
                    }}
                  >
                    {c.gemini}
                  </td>
                  <td
                    style={{
                      padding: "9px 6px",
                      borderBottom: "1px solid #e8ebef",
                      color: "#8b95a3",
                      textAlign: "right",
                      fontSize: 12.5,
                    }}
                  >
                    총 {c.total}회
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unexposedRecent.length > 0 && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#16202c", marginBottom: 10 }}>
            이번 주 미노출 상세
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unexposedRecent.map((u, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid #e8ebef",
                  borderLeft: "3px solid #b45309",
                  background: "#fdf3e3",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 5,
                      background: u.provider === "chatgpt" ? "#eaf2fc" : "#e8f8f1",
                      color: u.provider === "chatgpt" ? CHATGPT_COLOR : GEMINI_COLOR,
                    }}
                  >
                    {u.provider === "chatgpt" ? "ChatGPT" : "Gemini"}
                  </span>
                  <span style={{ marginLeft: 6, color: "#16202c" }}>{u.keyword}</span>
                </div>
                <div style={{ fontSize: 12, color: "#8b95a3" }}>
                  {u.competitors.length > 0
                    ? `대신 언급된 ${competitorLabel}: ${u.competitors.slice(0, 5).join(", ")}${u.competitors.length > 5 ? " 외" : ""}`
                    : `${competitorLabel} 언급 없이 미노출`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
