"use client";

import { useState } from "react";
import type { TrendPoint } from "@/lib/types";

type Props = {
  data: TrendPoint[];
};

const WIDTH = 640;
const HEIGHT = 260;
const PADDING = { top: 16, right: 16, bottom: 32, left: 36 };
const CHATGPT_COLOR = "#2a78d6";
const GEMINI_COLOR = "#1baf7a";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function computeMonthlyTable(data: TrendPoint[]) {
  const groups = new Map<string, TrendPoint[]>();
  for (const point of data) {
    const key = point.createdAt.slice(0, 7); // YYYY-MM
    const list = groups.get(key) ?? [];
    list.push(point);
    groups.set(key, list);
  }

  const years =
    data.length > 0
      ? Array.from(new Set(data.map((p) => Number(p.createdAt.slice(0, 4))))).sort()
      : [new Date().getFullYear()];

  return years.map((year) => ({
    year,
    months: Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const points = groups.get(key) ?? [];
      return {
        month,
        chatgptAvg: average(points.map((p) => p.chatgptRate).filter((v): v is number => v !== null)),
        geminiAvg: average(points.map((p) => p.geminiRate).filter((v): v is number => v !== null)),
      };
    }),
  }));
}

function buildLine(
  points: (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number
) {
  const segments: string[] = [];
  let current: string[] = [];

  points.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${x(i)},${y(v)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  return segments;
}

export function TrendChart({ data }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="border border-gray-100 rounded-xl bg-white shadow-sm flex flex-col items-center justify-center py-20 text-gray-400">
        <div className="font-medium text-gray-600">아직 모니터링 실행 기록이 없습니다</div>
        <div className="text-sm">모니터링을 실행해보세요</div>
      </div>
    );
  }

  const monthlyTable = computeMonthlyTable(data);

  const monthlySummary = (
    <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4 space-y-4">
      <div className="text-sm font-medium text-gray-700">월별 평균 언급률</div>
      {monthlyTable.map(({ year, months }) => (
        <div key={year} className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left text-xs font-normal text-gray-400 py-1.5 pr-3 whitespace-nowrap">
                  {year}년
                </th>
                {months.map((m) => (
                  <th
                    key={m.month}
                    className="text-center text-xs font-normal text-gray-400 py-1.5 px-2 whitespace-nowrap"
                  >
                    {m.month}월
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  <span className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CHATGPT_COLOR }} />
                    ChatGPT
                  </span>
                </td>
                {months.map((m) => (
                  <td key={m.month} className="text-center py-1.5 px-2 text-gray-700">
                    {m.chatgptAvg === null ? <span className="text-gray-300">-</span> : `${m.chatgptAvg}%`}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  <span className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: GEMINI_COLOR }} />
                    Gemini
                  </span>
                </td>
                {months.map((m) => (
                  <td key={m.month} className="text-center py-1.5 px-2 text-gray-700">
                    {m.geminiAvg === null ? <span className="text-gray-300">-</span> : `${m.geminiAvg}%`}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );

  if (data.length < 2) {
    return (
      <div className="space-y-4">
        {monthlySummary}
        <div className="border border-gray-100 rounded-xl bg-white shadow-sm flex flex-col items-center justify-center py-16 text-gray-400">
          <div className="font-medium text-gray-600">추이 그래프를 보려면 2회 이상의 실행 기록이 필요합니다</div>
          <div className="text-sm">모니터링을 몇 차례 더 실행해보세요</div>
        </div>
      </div>
    );
  }

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const x = (i: number) => PADDING.left + (innerWidth * i) / (data.length - 1);
  const y = (v: number) => PADDING.top + innerHeight * (1 - v / 100);

  const chatgptSegments = buildLine(
    data.map((d) => d.chatgptRate),
    x,
    y
  );
  const geminiSegments = buildLine(
    data.map((d) => d.geminiRate),
    x,
    y
  );

  const yTicks = [0, 25, 50, 75, 100];
  const xTickEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="space-y-4">
      {monthlySummary}
      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHATGPT_COLOR }} />
          ChatGPT
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: GEMINI_COLOR }} />
          Gemini
        </span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="언급률 추이 그래프">
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e1e0d9"
              strokeWidth={1}
            />
            <text x={PADDING.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#898781">
              {tick}%
            </text>
          </g>
        ))}

        {data.map((d, i) =>
          i % xTickEvery === 0 ? (
            <text
              key={d.runId}
              x={x(i)}
              y={HEIGHT - PADDING.bottom + 16}
              textAnchor="middle"
              fontSize={10}
              fill="#898781"
            >
              {formatDate(d.createdAt)}
            </text>
          ) : null
        )}

        {chatgptSegments.map((points, i) => (
          <polyline key={`c${i}`} points={points} fill="none" stroke={CHATGPT_COLOR} strokeWidth={2} strokeLinecap="round" />
        ))}
        {geminiSegments.map((points, i) => (
          <polyline key={`g${i}`} points={points} fill="none" stroke={GEMINI_COLOR} strokeWidth={2} strokeLinecap="round" />
        ))}

        {data.map((d, i) => (
          <g key={d.runId}>
            {d.chatgptRate !== null && (
              <circle
                cx={x(i)}
                cy={y(d.chatgptRate)}
                r={hoverIndex === i ? 5 : 3}
                fill={CHATGPT_COLOR}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            )}
            {d.geminiRate !== null && (
              <circle
                cx={x(i)}
                cy={y(d.geminiRate)}
                r={hoverIndex === i ? 5 : 3}
                fill={GEMINI_COLOR}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            )}
            <rect
              x={x(i) - innerWidth / (data.length - 1) / 2}
              y={PADDING.top}
              width={innerWidth / (data.length - 1)}
              height={innerHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          </g>
        ))}

        {hoverIndex !== null && (
          <g>
            <line
              x1={x(hoverIndex)}
              x2={x(hoverIndex)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke="#c3c2b7"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          </g>
        )}
      </svg>

      {hoverIndex !== null && (
        <div className="text-xs text-gray-600 border-t border-gray-100 pt-2 mt-1">
          <span className="font-medium">{formatDate(data[hoverIndex].createdAt)}</span>
          {data[hoverIndex].chatgptRate !== null && (
            <span className="ml-3">ChatGPT {data[hoverIndex].chatgptRate}%</span>
          )}
          {data[hoverIndex].geminiRate !== null && (
            <span className="ml-3">Gemini {data[hoverIndex].geminiRate}%</span>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
