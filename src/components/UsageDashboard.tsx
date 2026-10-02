"use client";

import type { UsageSummary } from "@/lib/types";
import { PROVIDER_META, providerKeys } from "@/lib/providers";

type Props = {
  usage: UsageSummary | null;
};

function usd(value: number) {
  return `$${value < 1 ? value.toFixed(3) : value.toFixed(2)}`;
}

function krw(value: number, rate: number) {
  const won = Math.round((value * rate) / 100) * 100;
  return `약 ${won.toLocaleString()}원`;
}

export function UsageDashboard({ usage }: Props) {
  if (!usage) {
    return <div className="text-sm text-gray-400 py-12 text-center">비용을 계산하는 중...</div>;
  }

  const { lastMonth, thisMonth, assumptions, costPerCall, krwPerUsd } = usage;
  const providerNames = assumptions.providers.map((p) => PROVIDER_META[p].label).join("·");

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
          <div className="text-xs text-gray-500 mb-1">지난달 ({lastMonth.label}) 실제</div>
          <div className="text-2xl font-semibold">{usd(lastMonth.costUsd)}</div>
          <div className="text-xs text-gray-400 mt-1">
            {krw(lastMonth.costUsd, krwPerUsd)} · 실행 {lastMonth.runs}회
          </div>
        </div>
        <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
          <div className="text-xs text-gray-500 mb-1">이번 달 ({thisMonth.label}) 지금까지</div>
          <div className="text-2xl font-semibold">{usd(thisMonth.costUsd)}</div>
          <div className="text-xs text-gray-400 mt-1">
            {krw(thisMonth.costUsd, krwPerUsd)} · 실행 {thisMonth.runs}회
          </div>
        </div>
        <div className="border border-blue-100 rounded-xl bg-blue-50/40 shadow-sm p-4">
          <div className="text-xs text-blue-700 mb-1">이번 달 예상 (월말까지)</div>
          <div className="text-2xl font-semibold text-blue-700">{usd(thisMonth.projectedUsd)}</div>
          <div className="text-xs text-blue-600/70 mt-1">
            {krw(thisMonth.projectedUsd, krwPerUsd)} · 자동 실행 {thisMonth.remainingRuns}회 남음
          </div>
        </div>
      </div>

      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4 text-xs text-gray-600 leading-relaxed">
        <div className="font-medium text-gray-700 mb-1">예상 비용 계산 기준</div>
        <div>
          AI {assumptions.providers.length}곳({providerNames || "없음"}) · 질문마다 기본 {assumptions.baseSamples}회(결과가 갈리면 최대
          5회) · {assumptions.intervalDays}일마다 자동 실행(한 달 약 {assumptions.scheduledRunsPerMonth}회)
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {providerKeys(costPerCall).map((p) => {
            const c = costPerCall[p]!;
            return (
              <span key={p}>
                <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: PROVIDER_META[p].color }} />
                {PROVIDER_META[p].label} 1회 {usd(c.usd)} × 평균 {c.samples.toFixed(1)}회
                <span className="text-gray-400"> ({c.measured ? "최근 30일 실측" : "실측 전 추정"})</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
        <div className="text-sm font-medium text-gray-700 mb-3">병원별 비용</div>
        {usage.byClient.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">클라이언트가 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b">
                  <th className="py-2 font-normal">병원</th>
                  <th className="py-2 font-normal text-right whitespace-nowrap">질문</th>
                  <th className="py-2 font-normal text-right whitespace-nowrap">1회 실행</th>
                  <th className="py-2 font-normal text-right whitespace-nowrap">지난달</th>
                  <th className="py-2 font-normal text-right whitespace-nowrap">이번 달 현재</th>
                  <th className="py-2 font-normal text-right whitespace-nowrap">이번 달 예상</th>
                </tr>
              </thead>
              <tbody>
                {usage.byClient.map((c) => (
                  <tr key={c.clientId} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 text-gray-700">{c.clientName}</td>
                    <td className="py-2 text-right text-gray-600">{c.keywords}개</td>
                    <td className="py-2 text-right text-gray-600">{usd(c.perRunUsd)}</td>
                    <td className="py-2 text-right text-gray-600 whitespace-nowrap">
                      {usd(c.lastMonthUsd)} <span className="text-gray-400 text-xs">({c.lastMonthRuns}회)</span>
                    </td>
                    <td className="py-2 text-right text-gray-600 whitespace-nowrap">
                      {usd(c.thisMonthUsd)} <span className="text-gray-400 text-xs">({c.thisMonthRuns}회)</span>
                    </td>
                    <td className="py-2 text-right font-medium text-blue-700 whitespace-nowrap">
                      {usd(c.projectedUsd)} <span className="text-blue-400 text-xs">(+{c.remainingRuns}회)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-400 leading-relaxed">
        * 공개 단가로 계산한 추정치이며 실제 청구액과 다를 수 있습니다. 원화는 1달러 {krwPerUsd.toLocaleString()}원으로 환산했습니다.
        <br />* 예상에는 자동 실행만 들어갑니다. &lsquo;모니터링 실행&rsquo; 버튼으로 직접 돌린 횟수, 홈페이지 분석·콘텐츠 제안
        비용은 빠져 있습니다. 질문을 늘리거나 AI를 추가하면 예상 비용도 그만큼 늘어납니다.
      </div>
    </div>
  );
}
