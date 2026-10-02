"use client";

import { useState } from "react";
import type { ExposureTally, TrendPoint } from "@/lib/types";
import { PROVIDER_META, PROVIDERS, type Provider } from "@/lib/providers";
import { marginOfError, percent, significantChange } from "@/lib/stats";

type Props = {
  data: TrendPoint[];
};

const WIDTH = 640;
const HEIGHT = 260;
const PADDING = { top: 16, right: 16, bottom: 32, left: 36 };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function addTally(a: ExposureTally | undefined, b: ExposureTally | undefined): ExposureTally {
  return { count: (a?.count ?? 0) + (b?.count ?? 0), total: (a?.total ?? 0) + (b?.total ?? 0) };
}

/** 한 번이라도 측정한 AI만 표준 순서대로 */
function providersInTrend(data: TrendPoint[]): Provider[] {
  return PROVIDERS.filter((p) => data.some((d) => d.rates[p] !== undefined));
}

function rateOf(point: TrendPoint, provider: Provider): number | null {
  return point.rates[provider] ?? null;
}

/** 월별로 노출/측정 횟수를 합쳐 비율을 낸다(실행마다 측정 횟수가 달라 단순 평균보다 정확하다) */
function computeMonthlyTable(data: TrendPoint[], providers: Provider[]) {
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
      const tallies = Object.fromEntries(
        providers.map((p) => [p, points.reduce<ExposureTally>((acc, point) => addTally(acc, point.counts?.[p]), { count: 0, total: 0 })])
      ) as Record<Provider, ExposureTally>;
      return { month, tallies };
    }),
  }));
}

/** 직전 달(측정이 있는 달)보다 의미 있게 오르거나 내렸으면 화살표 */
function changeMark(prev: ExposureTally | null, cur: ExposureTally) {
  if (!prev || prev.total === 0 || cur.total === 0) return null;
  const change = significantChange(prev.count, prev.total, cur.count, cur.total);
  if (change === 1) return <span className="text-emerald-600 text-[10px] ml-0.5">▲</span>;
  if (change === -1) return <span className="text-red-500 text-[10px] ml-0.5">▼</span>;
  return null;
}

function buildLine(points: (number | null)[], x: (i: number) => number, y: (v: number) => number) {
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

  const providers = providersInTrend(data);
  const monthlyTable = computeMonthlyTable(data, providers);

  const monthlySummary = (
    <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-gray-700">월별 AI 추천 확률</div>
        <div className="text-[11px] text-gray-400">▲▼ 우연으로 보기 어려운 변화(95% 기준)만 표시</div>
      </div>
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
              {providers.map((provider) => {
                let prev: ExposureTally | null = null;
                return (
                <tr key={provider} className="border-t border-gray-100">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: PROVIDER_META[provider].color }}
                      />
                      {PROVIDER_META[provider].label}
                    </span>
                  </td>
                  {months.map((m) => {
                    const tally = m.tallies[provider];
                    const value = percent(tally.count, tally.total);
                    const mark = value === null ? null : changeMark(prev, tally);
                    if (value !== null) prev = tally;
                    return (
                      <td
                        key={m.month}
                        className="text-center py-1.5 px-2 text-gray-700 whitespace-nowrap"
                        title={value === null ? undefined : `${tally.count}/${tally.total}회 · 오차범위 ±${marginOfError(tally.count, tally.total)}%p`}
                      >
                        {value === null ? <span className="text-gray-300">-</span> : `${value}%`}
                        {mark}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
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

  const yTicks = [0, 25, 50, 75, 100];
  const xTickEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="space-y-4">
      {monthlySummary}
      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-gray-600">
          {providers.map((provider) => (
            <span key={provider} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: PROVIDER_META[provider].color }} />
              {PROVIDER_META[provider].label}
            </span>
          ))}
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
              <text
                x={PADDING.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="#898781"
              >
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

          {providers.map((provider) =>
            buildLine(
              data.map((d) => rateOf(d, provider)),
              x,
              y
            ).map((points, i) => (
              <polyline
                key={`${provider}-${i}`}
                points={points}
                fill="none"
                stroke={PROVIDER_META[provider].color}
                strokeWidth={2}
                strokeLinecap="round"
              />
            ))
          )}

          {data.map((d, i) => (
            <g key={d.runId}>
              {providers.map((provider) => {
                const value = rateOf(d, provider);
                return value === null ? null : (
                  <circle
                    key={provider}
                    cx={x(i)}
                    cy={y(value)}
                    r={hoverIndex === i ? 5 : 3}
                    fill={PROVIDER_META[provider].color}
                    onMouseEnter={() => setHoverIndex(i)}
                    onMouseLeave={() => setHoverIndex(null)}
                  />
                );
              })}
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

          {data.map((d, i) =>
            d.conditionChanged ? (
              <g key={`cond-${d.runId}`}>
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={PADDING.top}
                  y2={HEIGHT - PADDING.bottom}
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <text x={x(i) + 4} y={PADDING.top + 10} fontSize={10} fill="#d97706">
                  측정 방식 변경
                </text>
              </g>
            ) : null
          )}

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
            {providers.map((provider) => {
              const value = rateOf(data[hoverIndex], provider);
              const tally = data[hoverIndex].counts?.[provider];
              const margin = tally ? marginOfError(tally.count, tally.total) : null;
              return value === null ? null : (
                <span key={provider} className="ml-3">
                  {PROVIDER_META[provider].label} {value}%
                  {tally && (
                    <span className="text-gray-400">
                      {" "}
                      ({tally.count}/{tally.total}
                      {margin !== null ? ` · ±${margin}%p` : ""})
                    </span>
                  )}
                </span>
              );
            })}
            {data[hoverIndex].condition && (
              <div className="text-[11px] text-gray-400 mt-1">측정 조건: {data[hoverIndex].condition}</div>
            )}
          </div>
        )}
        <div className="text-[11px] text-gray-400 mt-2">
          한 번의 실행은 표본이 적어 들쭉날쭉합니다. 주황 점선은 질문 방식·모델·반복 횟수가 바뀐 시점이라 그 앞뒤 수치를
          그대로 비교하기 어렵습니다.
        </div>
      </div>
    </div>
  );
}
