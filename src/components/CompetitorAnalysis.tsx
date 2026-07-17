"use client";

import { useState } from "react";
import type { MonitoringResult, Provider } from "@/lib/types";
import { api } from "@/lib/api";

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

function UnexposedCard({ result }: { result: ResultWithKeyword }) {
  const [note, setNote] = useState(result.analysis_note);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const updated = await api.analyzeResult(result.id);
      setNote(updated.analysis_note);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between gap-2 mb-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-green-600 font-medium">{PROVIDER_LABEL[result.provider]}</span>
          <span className="text-gray-700">{result.keywords.text}</span>
        </div>
        {!note && (
          <button
            className="text-xs px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50 shrink-0"
            disabled={loading}
            onClick={handleAnalyze}
          >
            {loading ? "분석 중..." : "분석"}
          </button>
        )}
      </div>

      {result.competitors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {result.competitors.map((c) => (
            <span key={c} className="text-xs bg-red-50 text-red-500 rounded-full px-2 py-1">
              {c}
            </span>
          ))}
        </div>
      )}

      {error && <div className="text-xs text-red-500">{error}</div>}
      {note && <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mt-1">{note}</div>}
    </div>
  );
}

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
              <UnexposedCard key={r.id} result={r} />
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
