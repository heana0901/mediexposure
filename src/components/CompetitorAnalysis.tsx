"use client";

import { useState } from "react";
import type {
  ClientType,
  CompetitorFrequencyEntry,
  MonitoringResult,
  Provider,
  SelfExposure,
  SourceFrequencyEntry,
} from "@/lib/types";
import { api } from "@/lib/api";
import { IconAlertTriangle, IconBuilding, IconTrendingUp, IconLink } from "./icons";

type ResultWithKeyword = MonitoringResult & { keywords: { text: string } };

const PROVIDER_LABEL: Record<Provider, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
};

const CHATGPT_COLOR = "#2a78d6";
const GEMINI_COLOR = "#1baf7a";

type Props = {
  clientId: string;
  clientName: string;
  clientType: ClientType;
  unexposed: ResultWithKeyword[];
  competitorFrequency: CompetitorFrequencyEntry[];
  sourceFrequency: SourceFrequencyEntry[];
  totalResults: number;
  selfExposure: SelfExposure;
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
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2 mb-2 text-sm">
        <div className="flex items-center gap-2">
          <span
            className="font-medium"
            style={{ color: result.provider === "chatgpt" ? CHATGPT_COLOR : GEMINI_COLOR }}
          >
            {PROVIDER_LABEL[result.provider]}
          </span>
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

function ContentSuggestions({ clientId }: { clientId: string }) {
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSuggest() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getContentSuggestions(clientId);
      setSuggestions(res.suggestions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 font-medium text-sm text-gray-700">
          <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <IconTrendingUp className="w-4 h-4" />
          </span>
          콘텐츠 개선 제안
        </span>
        {!suggestions && (
          <button
            className="text-xs px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50 shrink-0"
            disabled={loading}
            onClick={handleSuggest}
          >
            {loading ? "생성 중..." : "제안 받기"}
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
      {suggestions ? (
        <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{suggestions}</div>
      ) : (
        <div className="text-sm text-gray-400 py-4 text-center">
          미노출 키워드와 경쟁 현황을 바탕으로 보강하면 좋을 콘텐츠를 제안해드립니다
        </div>
      )}
    </div>
  );
}

export function CompetitorAnalysis({
  clientId,
  clientName,
  clientType,
  unexposed,
  competitorFrequency,
  sourceFrequency,
  totalResults,
  selfExposure,
}: Props) {
  const selfRate = selfExposure.total === 0 ? 0 : Math.round((selfExposure.count / selfExposure.total) * 100);
  const competitorLabel = clientType === "hospital" ? "경쟁병원" : "경쟁업체";

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 font-medium text-sm text-gray-700">
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <IconAlertTriangle className="w-4 h-4" />
            </span>
            미노출 (최근 7일)
          </span>
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

      <div className="space-y-6">
        <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 font-medium text-sm text-gray-700">
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <IconBuilding className="w-4 h-4" />
              </span>
              {clientName} 노출 빈도
            </span>
            <span className="text-xs text-gray-400">전체 {selfExposure.total}건 기준</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl font-semibold text-blue-600">{selfExposure.count}회</span>
            <span className="text-sm text-gray-400">({selfRate}%)</span>
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span>
              ChatGPT {selfExposure.chatgpt.count}/{selfExposure.chatgpt.total}회
            </span>
            <span>
              Gemini {selfExposure.gemini.count}/{selfExposure.gemini.total}회
            </span>
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 font-medium text-sm text-gray-700">
              <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <IconTrendingUp className="w-4 h-4" />
              </span>
              {competitorLabel} 노출 빈도
            </span>
            <span className="text-xs text-gray-400">전체 {totalResults}건 기준</span>
          </div>

          {competitorFrequency.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">데이터가 없습니다</div>
          ) : (
            <ol className="space-y-2">
              {competitorFrequency.slice(0, 10).map((c, i) => (
                <li key={c.name} className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-600 text-white text-xs shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-gray-700 truncate">{c.name}</span>
                  <span className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: CHATGPT_COLOR }} />
                      {c.chatgpt}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: GEMINI_COLOR }} />
                      {c.gemini}
                    </span>
                    <span className="text-gray-400">총 {c.total}회</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 font-medium text-sm text-gray-700">
              <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <IconLink className="w-4 h-4" />
              </span>
              AI 인용 출처 TOP 10
            </span>
          </div>

          {sourceFrequency.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">인용된 출처가 없습니다</div>
          ) : (
            <ol className="space-y-2">
              {sourceFrequency.map((s, i) => (
                <li key={s.domain} className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-sky-600 text-white text-xs shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-gray-700 truncate">{s.domain}</span>
                  <span className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: CHATGPT_COLOR }} />
                      {s.chatgpt}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: GEMINI_COLOR }} />
                      {s.gemini}
                    </span>
                    <span className="text-gray-400">총 {s.total}회</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <ContentSuggestions clientId={clientId} />
      </div>
    </div>
  );
}
