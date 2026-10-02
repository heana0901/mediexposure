"use client";

import { useState } from "react";
import type {
  ClientType,
  CompetitorFrequencyEntry,
  ProviderCounts,
  SelfExposure,
  SourceFrequencyEntry,
  ResultWithKeyword,
} from "@/lib/types";
import { keywordTextOf } from "@/lib/types";
import { PROVIDER_META, PROVIDERS, providerKeys, type Provider } from "@/lib/providers";
import { api } from "@/lib/api";
import { IconAlertTriangle, IconBuilding, IconTrendingUp, IconLink } from "./icons";

/** AI별 횟수를 색 점과 함께 나란히 보여준다 */
function ProviderCountDots({ counts, providers }: { counts: ProviderCounts; providers: Provider[] }) {
  return (
    <>
      {providers.map((provider) => (
        <span key={provider} className="flex items-center gap-1" title={PROVIDER_META[provider].label}>
          <span className="w-2 h-2 rounded-full" style={{ background: PROVIDER_META[provider].color }} />
          {counts[provider] ?? 0}
        </span>
      ))}
    </>
  );
}

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
          <span className="font-medium" style={{ color: PROVIDER_META[result.provider].color }}>
            {PROVIDER_META[result.provider].label}
          </span>
          <span className="text-gray-700">{keywordTextOf(result)}</span>
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
        <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto pr-1">
          {suggestions}
        </div>
      ) : (
        <div className="text-sm text-gray-400 py-4 text-center">
          미노출 키워드와 경쟁 현황을 바탕으로 보강하면 좋을 콘텐츠를 제안해드립니다
        </div>
      )}
    </div>
  );
}

type SubTab = "frequency" | "unexposed" | "insights";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "frequency", label: "노출 빈도" },
  { key: "unexposed", label: "미노출" },
  { key: "insights", label: "인사이트" },
];

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
  const [subTab, setSubTab] = useState<SubTab>("frequency");
  const selfRate = selfExposure.total === 0 ? 0 : Math.round((selfExposure.count / selfExposure.total) * 100);
  const competitorLabel = clientType === "hospital" ? "경쟁병원" : "경쟁업체";
  const entityLabel = clientType === "hospital" ? "병원" : "업체";

  // 실제로 측정한 AI만 (과거 데이터엔 ChatGPT·Gemini만 있을 수 있다)
  const measured = providerKeys(selfExposure.byProvider);
  const providers = measured.length ? measured : PROVIDERS.filter((p) => p === "chatgpt" || p === "gemini");

  type RankedEntity = { name: string; count: number; isSelf: boolean };

  function rankedCandidates(provider: Provider): RankedEntity[] {
    const candidates: RankedEntity[] = [
      { name: clientName, count: selfExposure.byProvider[provider]?.count ?? 0, isSelf: true },
      ...competitorFrequency.map((c) => ({ name: c.name, count: c.counts[provider] ?? 0, isSelf: false })),
    ];
    return candidates.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  }

  function selfRankByProvider(provider: Provider): number | null {
    const idx = rankedCandidates(provider).findIndex((c) => c.isSelf);
    return idx === -1 ? null : idx + 1;
  }

  return (
    <div>
      <div className="flex gap-1.5 mb-4">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              subTab === t.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            onClick={() => setSubTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "frequency" && (
        <div className="grid md:grid-cols-2 gap-6">
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
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {providers.map((provider) => {
                const tally = selfExposure.byProvider[provider] ?? { count: 0, total: 0 };
                const rank = selfRankByProvider(provider);
                return (
                  <span key={provider}>
                    {PROVIDER_META[provider].label} {tally.count}/{tally.total}회
                    {rank && <span className="text-blue-600 font-semibold"> · {rank}위</span>}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
            <div className="flex items-center gap-2 font-medium text-sm text-gray-700 mb-3">
              <span className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                <IconTrendingUp className="w-4 h-4" />
              </span>
              AI별 최다 노출 {entityLabel}
            </div>

            <div className="space-y-3">
              {providers.map((provider) => {
                const top = rankedCandidates(provider)[0] ?? null;
                return (
                  <div key={provider} className="flex items-center justify-between gap-3">
                    <span className="text-xs shrink-0" style={{ color: PROVIDER_META[provider].color }}>
                      {PROVIDER_META[provider].label}
                    </span>
                    {top ? (
                      <span className="text-sm truncate">
                        <span className={top.isSelf ? "text-blue-600 font-bold" : "text-black font-bold"}>
                          {top.name}
                        </span>{" "}
                        <span className="text-gray-400 font-normal">({top.count}회)</span>
                      </span>
                    ) : (
                      <span className="text-sm text-gray-300">데이터 없음</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4 md:col-span-2">
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
              <ol className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {competitorFrequency.slice(0, 10).map((c, i) => (
                  <li key={c.name} className="flex items-center gap-3 text-sm">
                    <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-600 text-white text-xs shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-gray-700 truncate">{c.name}</span>
                    <span className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                      <ProviderCountDots counts={c.counts} providers={providers} />
                      <span className="text-gray-400">총 {c.total}회</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {subTab === "unexposed" && (
        <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-2 font-medium text-sm text-gray-700">
              <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <IconAlertTriangle className="w-4 h-4" />
              </span>
              미노출 (최근 3회 실행)
            </span>
            <span className="text-xs text-gray-400">{unexposed.length}건</span>
          </div>

          {unexposed.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">미노출 항목이 없습니다</div>
          ) : (
            <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
              {unexposed.map((r) => (
                <UnexposedCard key={r.id} result={r} />
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === "insights" && (
        <div className="grid md:grid-cols-2 gap-6">
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
              <ol className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {sourceFrequency.map((s, i) => (
                  <li key={s.domain} className="flex items-center gap-3 text-sm">
                    <span className="w-6 h-6 flex items-center justify-center rounded-full bg-sky-600 text-white text-xs shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-gray-700 truncate">{s.domain}</span>
                    <span className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                      <ProviderCountDots counts={s.counts} providers={providers} />
                      <span className="text-gray-400">총 {s.total}회</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <ContentSuggestions clientId={clientId} />
        </div>
      )}
    </div>
  );
}
