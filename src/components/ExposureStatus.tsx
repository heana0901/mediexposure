"use client";

import { useMemo, useState } from "react";
import type { ClientType, MonitoringRun, ResultWithKeyword } from "@/lib/types";
import { keywordTextOf } from "@/lib/types";
import { PROVIDER_META, providersIn, type Provider } from "@/lib/providers";
import { IconEye, IconLink } from "./icons";

type Props = {
  clientName: string;
  clientType: ClientType;
  results: ResultWithKeyword[];
  runs: MonitoringRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
};

function groupByKeyword(results: ResultWithKeyword[]) {
  const map = new Map<string, ResultWithKeyword[]>();
  for (const r of results) {
    // 질문이 지워진 결과는 keyword_id가 비므로 문구를 키로 삼는다
    const key = r.keyword_id ?? `text:${keywordTextOf(r)}`;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return Array.from(map.entries());
}

/** 한 AI에 같은 질문을 여러 번 물은 답변들을 회차 순으로 */
function samplesOf(results: ResultWithKeyword[], provider: Provider) {
  return results
    .filter((r) => r.provider === provider)
    .sort((a, b) => (a.sample_index ?? 0) - (b.sample_index ?? 0));
}

function averageRank(samples: ResultWithKeyword[]): number | null {
  const ranks = samples.filter((r) => r.mentioned && r.rank).map((r) => r.rank as number);
  if (ranks.length === 0) return null;
  return Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10;
}

export function highlight(text: string, clientName: string) {
  if (!clientName) return text;
  const parts = text.split(clientName);
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <mark key={i} className="bg-yellow-200 rounded px-0.5">
            {clientName}
          </mark>,
          part,
        ]
  );
}

function ProviderTile({
  provider,
  samples,
  active,
  onClick,
}: {
  provider: Provider;
  samples: ResultWithKeyword[];
  active: boolean;
  onClick: () => void;
}) {
  const meta = PROVIDER_META[provider];
  const hits = samples.filter((r) => r.mentioned).length;
  const rate = Math.round((hits / samples.length) * 100);
  const avgRank = averageRank(samples);
  const skippedSearch = samples.filter((r) => r.searched === false).length;

  return (
    <button
      onClick={onClick}
      className={`flex flex-col justify-start text-left border rounded-lg p-3 transition ${
        active ? "border-blue-400 bg-blue-50" : "border-gray-100 hover:border-gray-200"
      }`}
    >
      <div className="flex items-center gap-1.5 text-sm text-gray-600">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
        {meta.label}
      </div>
      <div className={`text-xl font-semibold ${hits > 0 ? "text-gray-900" : "text-gray-400"}`}>{rate}%</div>
      <div className="text-xs mt-1">
        {hits > 0 ? (
          <span className="text-blue-600">
            {samples.length}회 중 {hits}회 노출{avgRank ? ` · 평균 ${avgRank}위` : ""}
          </span>
        ) : (
          <span className="text-red-400">{samples.length}회 모두 미노출</span>
        )}
      </div>
      {skippedSearch > 0 && <div className="text-[11px] text-amber-600 mt-1">웹검색 미실행 {skippedSearch}회</div>}
    </button>
  );
}

function KeywordCard({
  clientName,
  clientType,
  keywordText,
  results,
}: {
  clientName: string;
  clientType: ClientType;
  keywordText: string;
  results: ResultWithKeyword[];
}) {
  const competitorLabel = clientType === "hospital" ? "경쟁 병원" : "경쟁 업체";
  const providers = providersIn(results);
  const mentionedCount = results.filter((r) => r.mentioned).length;
  const overallRate = Math.round((mentionedCount / results.length) * 100);

  const [activeProvider, setActiveProvider] = useState<Provider>(
    providers.find((p) => results.some((r) => r.provider === p && r.mentioned)) ?? providers[0]
  );
  const [activeSample, setActiveSample] = useState(0);

  const samples = samplesOf(results, activeProvider);
  const active = samples[Math.min(activeSample, samples.length - 1)] ?? results[0];

  function selectProvider(provider: Provider) {
    setActiveProvider(provider);
    // 노출된 회차가 있으면 그 답변부터 보여준다
    const index = samplesOf(results, provider).findIndex((r) => r.mentioned);
    setActiveSample(index === -1 ? 0 : index);
  }

  return (
    <div className="border border-gray-100 rounded-xl bg-white overflow-hidden shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-sm text-gray-800">{keywordText}</span>
        <span className="text-xs text-gray-500">
          전체 노출 확률 <b className="text-gray-800">{overallRate}%</b> ({mentionedCount}/{results.length}회)
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
        {providers.map((provider) => (
          <ProviderTile
            key={provider}
            provider={provider}
            samples={samplesOf(results, provider)}
            active={active.provider === provider}
            onClick={() => selectProvider(provider)}
          />
        ))}
      </div>

      <div className="px-4 pb-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs text-gray-500">{PROVIDER_META[active.provider].label} 응답</span>
          {samples.length > 1 &&
            samples.map((r, i) => (
              <button
                key={r.id}
                onClick={() => setActiveSample(i)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  r.id === active.id
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {i + 1}회차 · {r.mentioned ? (r.rank ? `${r.rank}위` : "노출") : "미노출"}
              </button>
            ))}
        </div>
        <div className="border border-gray-100 rounded-lg p-3 max-h-72 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap bg-gray-50/60">
          {active.raw_response ? highlight(active.raw_response, clientName) : "응답 없음"}
        </div>
        {active.competitors.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-gray-500 mr-1">{competitorLabel}:</span>
            {active.competitors.map((c) => (
              <span key={c} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-1">
                {c}
              </span>
            ))}
          </div>
        )}

        {(active.search_queries ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-gray-500 mr-1">검색어:</span>
            {(active.search_queries ?? []).map((q) => (
              <span key={q} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-1">
                {q}
              </span>
            ))}
          </div>
        )}

        {active.sources.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-gray-500 mr-1">출처:</span>
            {active.sources.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-1 hover:bg-blue-100 truncate max-w-[220px]"
                title={s.url}
              >
                <IconLink className="w-3 h-3 shrink-0" />
                {s.title}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExposureStatus({ clientName, clientType, results, runs, selectedRunId, onSelectRun }: Props) {
  const groups = useMemo(() => groupByKeyword(results), [results]);

  return (
    <div className="space-y-4">
      {runs.length > 0 && (
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          value={selectedRunId ?? ""}
          onChange={(e) => onSelectRun(e.target.value)}
        >
          {runs.map((run, i) => (
            <option key={run.id} value={run.id}>
              {new Date(run.created_at).toLocaleString("ko-KR")}{" "}
              {i === 0 ? "(최신)" : ""}
            </option>
          ))}
        </select>
      )}

      {groups.length === 0 ? (
        <div className="border border-gray-100 rounded-xl bg-white shadow-sm flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center mb-3">
            <IconEye className="w-6 h-6" />
          </div>
          <div className="font-medium text-gray-600">모니터링 결과가 없습니다</div>
          <div className="text-sm">질문을 등록하고 모니터링을 실행해보세요</div>
        </div>
      ) : (
        groups.map(([keywordId, group]) => (
          <KeywordCard
            key={keywordId}
            clientName={clientName}
            clientType={clientType}
            keywordText={keywordTextOf(group[0])}
            results={group}
          />
        ))
      )}
    </div>
  );
}
