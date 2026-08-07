"use client";

import type { UsageSummary } from "@/lib/types";

type Props = {
  usage: UsageSummary;
};

function formatUsd(value: number) {
  return `$${value.toFixed(4)}`;
}

export function UsageDashboard({ usage }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
          <div className="text-xs text-gray-500 mb-1">이번 달 실행 횟수</div>
          <div className="text-2xl font-semibold">{usage.totalRuns}회</div>
        </div>
        <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
          <div className="text-xs text-gray-500 mb-1">이번 달 예상 비용</div>
          <div className="text-2xl font-semibold">{formatUsd(usage.totalCostUsd)}</div>
        </div>
      </div>

      <div className="text-xs text-gray-400">
        * 공개된 모델 가격을 기준으로 계산한 예상치이며, 실제 청구액과 다를 수 있습니다.
      </div>

      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
        <div className="text-sm font-medium text-gray-700 mb-3">클라이언트별 사용량</div>
        {usage.byClient.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">이번 달 실행 기록이 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b">
                <th className="py-2 font-normal">클라이언트</th>
                <th className="py-2 font-normal text-right">실행 횟수</th>
                <th className="py-2 font-normal text-right">예상 비용</th>
              </tr>
            </thead>
            <tbody>
              {usage.byClient.map((c) => (
                <tr key={c.clientId} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 text-gray-700">{c.clientName}</td>
                  <td className="py-2 text-right text-gray-600">{c.runs}회</td>
                  <td className="py-2 text-right text-gray-600">{formatUsd(c.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
