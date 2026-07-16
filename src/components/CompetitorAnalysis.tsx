"use client";

import type { MonitoringResult, Provider } from "@/lib/types";

type ResultWithKeyword = MonitoringResult & { keywords: { text: string } };

const PROVIDER_LABEL: Record<Provider, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
};

type Props = {
  unexposed: ResultWithKeyword[];
  competitorFrequency: { name: string; count: number }[];
  totalResults: number;
};

export function CompetitorAnalysis({ unexposed, competitorFrequency, totalResults }: Props) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="border rounded-xl bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-sm text-gray-700">⚠ 미노출 (미분석)</span>
          <span className="text-xs text-gray-400">{unexposed.length}건</span>
        </div>

        {unexposed.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">미노출 항목이 없습니다</div>
        ) : (
          <div className="space-y-3">
            {unexposed.map((r) => (
              <div key={r.id} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2 text-sm">
                  <span className="text-green-600 font-medium">{PROVIDER_LABEL[r.provider]}</span>
                  <span className="text-gray-700">{r.keywords.text}</span>
                </div>
                {r.competitors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.competitors.map((c) => (
                      <span
                        key={c}
                        className="text-xs bg-red-50 text-red-500 rounded-full px-2 py-1"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border rounded-xl bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-sm text-gray-700">📈 경쟁병원 노출 빈도</span>
          <span className="text-xs text-gray-400">전체 {totalResults}건 기준</span>
        </div>

        {competitorFrequency.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">데이터가 없습니다</div>
        ) : (
          <ol className="space-y-2">
            {competitorFrequency.slice(0, 10).map((c, i) => (
              <li key={c.name} className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-600 text-white text-xs">
                  {i + 1}
                </span>
                <span className="flex-1 text-gray-700">{c.name}</span>
                <span className="text-gray-400">{c.count}회</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
