"use client";

import { useMemo, useState } from "react";
import type { ClientType, MonitoringRun, Provider, ResultWithKeyword } from "@/lib/types";
import { keywordTextOf } from "@/lib/types";
import { IconEye, IconLink } from "./icons";



type Props = {
  clientName: string;
  clientType: ClientType;
  results: ResultWithKeyword[];
  runs: MonitoringRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
};

const PROVIDER_LABEL: Record<Provider, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
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

function highlight(text: string, clientName: string) {
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
  const mentionedCount = results.filter((r) => r.mentioned).length;
  const overallRate = Math.round((mentionedCount / results.length) * 100);

  const [activeProvider, setActiveProvider] = useState<Provider>(
    results.find((r) => r.mentioned)?.provider ?? results[0].provider
  );

  const active = results.find((r) => r.provider === activeProvider) ?? results[0];

  return (
    <div className="border border-gray-100 rounded-xl bg-white overflow-hidden shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
        <span className="font-medium text-sm text-gray-800">{keywordText}</span>
        <span className="text-xs text-gray-500">
          전체 언급률 <b className="text-gray-800">{overallRate}%</b> ({mentionedCount}/
          {results.length}건)
        </span>
      </div>

      <div className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${results.length}, 1fr)` }}>
        {results.map((r) => (
          <button
            key={r.provider}
            onClick={() => setActiveProvider(r.provider)}
            className={`text-left border rounded-lg p-3 transition ${
              activeProvider === r.provider
                ? "border-blue-400 bg-blue-50"
                : "border-gray-100 hover:border-gray-200"
            }`}
          >
            <div className="text-sm text-gray-600">{PROVIDER_LABEL[r.provider]}</div>
            <div className="text-xl font-semibold">{r.mentioned ? "100%" : "0%"}</div>
            <div className="text-xs mt-1">
              {r.mentioned ? (
                <span className="text-blue-600">{r.rank ? `${r.rank}순위 1회` : "언급 1회"}</span>
              ) : (
                <span className="text-red-400">미노출 1회</span>
              )}
            </div>
            {r.searched === false && (
              <div className="text-[11px] text-amber-600 mt-1">웹검색 미실행</div>
            )}
          </button>
        ))}
      </div>

      <div className="px-4 pb-4">
        <div className="text-xs text-gray-500 mb-2">
          {PROVIDER_LABEL[active.provider]} 응답 결과
        </div>
        <div className="border border-gray-100 rounded-lg p-3 max-h-72 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap bg-gray-50/60">
          {active.raw_response ? highlight(active.raw_response, clientName) : "응답 없음"}
        </div>
        {active.competitors.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-gray-500 mr-1">{competitorLabel}:</span>
            {active.competitors.map((c) => (
              <span
                key={c}
                className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-1"
              >
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
