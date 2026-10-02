"use client";

import { AXIS_META, scoreTone } from "@/lib/diagnose-shared";
import type { SiteAuditHistoryEntry } from "@/lib/types";

const STATUS_RANK = { fail: 0, warn: 1, pass: 2 } as const;
const STATUS_LABEL = { fail: "꼭 고칠 것", warn: "손볼 곳", pass: "이상 없음" } as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** 직전 분석과 비교해 좋아진 항목·나빠진 항목 */
function compareChecks(prev: SiteAuditHistoryEntry, latest: SiteAuditHistoryEntry) {
  const before = new Map(prev.checks.map((c) => [c.id, c]));
  const improved: { name: string; from: string; to: string }[] = [];
  const worsened: { name: string; from: string; to: string }[] = [];
  for (const check of latest.checks) {
    const old = before.get(check.id);
    if (!old || old.status === check.status) continue;
    const entry = { name: check.name, from: STATUS_LABEL[old.status], to: STATUS_LABEL[check.status] };
    if (STATUS_RANK[check.status] > STATUS_RANK[old.status]) improved.push(entry);
    else worsened.push(entry);
  }
  return { improved, worsened };
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-400">±0</span>;
  return value > 0 ? (
    <span className="text-emerald-600">▲{value}</span>
  ) : (
    <span className="text-red-500">▼{Math.abs(value)}</span>
  );
}

export function SiteAuditHistory({ history }: { history: SiteAuditHistoryEntry[] }) {
  if (history.length === 0) return null;

  const latest = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const diff = prev ? compareChecks(prev, latest) : null;
  const sameSite = prev ? hostOf(prev.url) === hostOf(latest.url) : true;
  const chart = history.slice(-12);
  const first = history[0];

  const W = 600;
  const H = 120;
  const barW = Math.min(36, (W - 20) / chart.length - 8);

  return (
    <div className="animate-fade-in-up border border-gray-100 rounded-xl bg-white shadow-sm p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <div className="text-sm font-medium text-gray-700">점수 기록</div>
        {history.length > 1 && (
          <div className="text-xs text-gray-500">
            처음 {first.score}점 → 지금 {latest.score}점 <Delta value={latest.score - first.score} />
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">
        홈페이지를 고친 뒤 다시 분석하면 점수가 여기에 쌓입니다. 무엇을 고쳐서 몇 점이 올랐는지 확인할 수 있어요.
      </p>

      {chart.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full h-auto mb-3" role="img" aria-label="홈페이지 점수 변화">
          {chart.map((h, i) => {
            const x = 10 + i * ((W - 20) / chart.length) + ((W - 20) / chart.length - barW) / 2;
            const barH = Math.max(2, (h.score / 100) * H);
            return (
              <g key={h.id}>
                <title>{`${fmtDate(h.createdAt)} · ${h.score}점 · ${hostOf(h.url)}`}</title>
                <rect x={x} y={H - barH} width={barW} height={barH} rx={3} fill={scoreTone(h.score)} opacity={0.85} />
                <text x={x + barW / 2} y={H - barH - 4} textAnchor="middle" fontSize={10} fill="#475569">
                  {h.score}
                </text>
                <text x={x + barW / 2} y={H + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
                  {fmtDate(h.createdAt)}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {diff && (
        <div className="border-t border-gray-50 pt-3">
          <div className="text-xs text-gray-500 mb-2">
            지난 분석({fmtDate(prev!.createdAt)} · {prev!.score}점) 대비 <Delta value={latest.score - prev!.score} />
            {!sameSite && <span className="text-amber-600"> · 분석한 주소가 달라 그대로 비교하기 어렵습니다</span>}
          </div>
          {diff.improved.length === 0 && diff.worsened.length === 0 ? (
            <div className="text-xs text-gray-400">달라진 항목이 없습니다.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {diff.improved.map((c) => (
                <li key={`up-${c.name}`} className="text-emerald-700">
                  ▲ {c.name} <span className="text-gray-400">({c.from} → {c.to})</span>
                </li>
              ))}
              {diff.worsened.map((c) => (
                <li key={`down-${c.name}`} className="text-red-600">
                  ▼ {c.name} <span className="text-gray-400">({c.from} → {c.to})</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-gray-500">
            {latest.axes.map((a) => {
              const before = prev!.axes.find((p) => p.axis === a.axis);
              return (
                <span key={a.axis}>
                  {AXIS_META[a.axis].short} {a.score}점 {before && <Delta value={a.score - before.score} />}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
