"use client";

import { useState } from "react";
import type {
  ClientType,
  CompetitorFrequencyEntry,
  ProviderCounts,
  SelfExposure,
  SourceFrequencyEntry,
  ResultWithKeyword,
  VisibilityMetrics,
  ExposureTally,
  DemandSummary,
} from "@/lib/types";
import { marginOfError, MIN_RELIABLE_SAMPLES, percent } from "@/lib/stats";
import { keywordTextOf } from "@/lib/types";
import { PROVIDER_META, PROVIDERS, providerKeys, type Provider } from "@/lib/providers";
import { api } from "@/lib/api";
import { stripMarkdown } from "@/lib/text";
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
  metrics?: VisibilityMetrics;
  demand?: DemandSummary;
};

/** 검색 수요(네이버 월간 검색량)를 반영한 AI 추천 확률과 질문별 표 */
function DemandCard({ demand, clientName }: { demand: DemandSummary; clientName: string }) {
  const known = demand.items.filter((i) => i.volume !== null);
  return (
    <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium text-gray-700">검색 수요 반영 AI 추천 확률</div>
          <p className="text-xs text-gray-400 mt-1">
            네이버 월간 검색량으로 질문마다 가중치를 줬습니다. 사람들이 많이 찾는 질문에서 {clientName}이(가) 얼마나
            추천되는지를 뜻합니다.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-blue-600">
            {demand.weightedRate === null ? "-" : `${demand.weightedRate}%`}
          </div>
          <div className="text-[11px] text-gray-400">질문 합계 월 {demand.totalVolume.toLocaleString()}회 검색</div>
        </div>
      </div>

      {!demand.configured && known.length === 0 ? (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          네이버 검색광고 API 키(NAVER_AD_API_KEY · NAVER_AD_SECRET_KEY · NAVER_AD_CUSTOMER_ID)를 Vercel 환경변수에
          넣으면 질문별 검색량이 표시됩니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left font-normal py-1.5">질문 (대표 검색어)</th>
                <th className="text-right font-normal py-1.5 px-2 whitespace-nowrap">월 검색량</th>
                <th className="text-right font-normal py-1.5 whitespace-nowrap">AI 추천 확률</th>
              </tr>
            </thead>
            <tbody>
              {demand.items.map((i) => {
                const big = (i.volume ?? 0) >= 100;
                const weak = i.rate !== null && i.rate < 30;
                return (
                  <tr key={i.keywordId} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2">
                      <span className="text-gray-800">{i.text}</span>
                      {i.searchKeyword && i.searchKeyword !== i.text && (
                        <span className="text-gray-400"> ({i.searchKeyword})</span>
                      )}
                      {big && weak && (
                        <span className="ml-1.5 text-[10px] text-red-600 bg-red-50 rounded px-1.5 py-0.5">
                          수요 큼 · 추천 약함
                        </span>
                      )}
                    </td>
                    <td className="text-right py-1.5 px-2 whitespace-nowrap text-gray-700">
                      {i.volume === null ? (
                        <span className="text-gray-300">-</span>
                      ) : i.volumeNote ? (
                        <span className="text-gray-400">{i.volumeNote}</span>
                      ) : (
                        i.volume.toLocaleString()
                      )}
                    </td>
                    <td className="text-right py-1.5 whitespace-nowrap">
                      {i.rate === null ? (
                        <span className="text-gray-300">측정 전</span>
                      ) : (
                        <span className={weak ? "text-red-500" : "text-gray-800"}>
                          {i.rate}% <span className="text-gray-400">({i.hits}/{i.total})</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** "33% ±5%p" — 표본이 적으면 오차범위 대신 '표본 부족'을 붙인다 */
function RateWithMargin({ tally, className = "" }: { tally: ExposureTally; className?: string }) {
  const value = percent(tally.count, tally.total);
  const margin = marginOfError(tally.count, tally.total);
  if (value === null) return <span className={`text-gray-300 ${className}`}>-</span>;
  return (
    <span className={className}>
      {value}%
      {tally.total < MIN_RELIABLE_SAMPLES ? (
        <span className="text-[11px] text-amber-600 font-normal"> 표본 부족</span>
      ) : (
        margin !== null && <span className="text-xs text-gray-400 font-normal"> ±{margin}%p</span>
      )}
    </span>
  );
}

function MetricTile({ title, hint, tally, unit }: { title: string; hint: string; tally: ExposureTally; unit: string }) {
  return (
    <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4" title={hint}>
      <div className="text-xs text-gray-500 mb-1">{title}</div>
      <RateWithMargin tally={tally} className="text-xl font-semibold text-gray-900" />
      <div className="text-[11px] text-gray-400 mt-1">
        {tally.count}/{tally.total}
        {unit}
      </div>
      <div className="text-[11px] text-gray-400 mt-1 leading-snug">{hint}</div>
    </div>
  );
}

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
      {note && <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mt-1 whitespace-pre-wrap">{stripMarkdown(note)}</div>}
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
          {stripMarkdown(suggestions)}
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
  metrics,
  demand,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>("frequency");
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

      {subTab === "frequency" && demand && <DemandCard demand={demand} clientName={clientName} />}

      {subTab === "frequency" && metrics && (
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <MetricTile
            title="점유율"
            hint={`답변에 나온 ${entityLabel} 언급 전체 중 ${clientName} 비중`}
            tally={metrics.shareOfVoice}
            unit="회 언급"
          />
          <MetricTile
            title="1순위 추천 비율"
            hint={`전체 답변 중 ${clientName}이(가) 가장 먼저 언급된 비율`}
            tally={metrics.firstPlace}
            unit="건 답변"
          />
          <MetricTile
            title="홈페이지 인용률"
            hint="출처가 붙은 답변 중 우리 홈페이지가 출처로 쓰인 비율"
            tally={metrics.ownCitation}
            unit="건 답변"
          />
        </div>
      )}

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
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-xs text-gray-500">AI 추천 확률</span>
              <RateWithMargin tally={selfExposure} className="text-2xl font-semibold text-blue-600" />
              <span className="text-sm text-gray-400">({selfExposure.count}회)</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {providers.map((provider) => {
                const tally = selfExposure.byProvider[provider] ?? { count: 0, total: 0 };
                const rank = selfRankByProvider(provider);
                return (
                  <span key={provider}>
                    {PROVIDER_META[provider].label} <RateWithMargin tally={tally} /> ({tally.count}/{tally.total}회)
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
                    <span className="flex-1 min-w-0 flex items-center gap-1.5">
                      <span
                        className="text-gray-700 truncate"
                        title={(c.spellings ?? []).length > 1 ? `합친 표기: ${c.spellings!.join(" / ")}` : undefined}
                      >
                        {c.name}
                      </span>
                      {(c.spellings ?? []).length > 1 && (
                        <span className="text-[10px] text-gray-400 shrink-0">표기 {c.spellings!.length}개 합침</span>
                      )}
                      {c.registry &&
                        (c.registry.found ? (
                          <span
                            className="text-[10px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 shrink-0"
                            title={[c.registry.officialName, c.registry.address].filter(Boolean).join(" · ")}
                          >
                            심평원 등록
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">
                            등록 정보 없음
                          </span>
                        ))}
                    </span>
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
                    <a
                      href={`https://${s.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-gray-700 truncate hover:text-blue-600 hover:underline"
                    >
                      {s.domain}
                    </a>
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
