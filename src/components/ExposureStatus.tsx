"use client";

import { useMemo, useState } from "react";
import type { ClientType, MonitoringRun, NaverResult, ResultWithKeyword } from "@/lib/types";
import { keywordTextOf } from "@/lib/types";
import { PROVIDER_META, providersIn, type Provider } from "@/lib/providers";
import { clientNameVariants } from "@/lib/nameMatch";
import { marginOfError } from "@/lib/stats";
import { stripMarkdown } from "@/lib/text";
import { IconEye, IconLink } from "./icons";

type Props = {
  clientName: string;
  clientAliases?: string[];
  naverResults?: NaverResult[];
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

/** 우리 병원 이름(별칭·띄어쓰기 차이 포함)을 노란색으로 표시한다 */
function highlight(text: string, names: string[]) {
  const patterns = names
    .filter(Boolean)
    .map((n) => [...n].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
  if (patterns.length === 0) return text;
  const re = new RegExp(`(${patterns.join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-yellow-200 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
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

function rankLabel(rank: number | null, total: number) {
  if (total < 0) return "조회 안 됨";
  if (total === 0) return "결과 없음";
  return rank ? `${rank}위` : `상위 ${total}개 중 없음`;
}

/** 같은 질문(대표 검색어)으로 본 네이버 노출 한 줄 요약 */
function NaverLine({ naver }: { naver: NaverResult }) {
  const [open, setOpen] = useState(false);
  const blog =
    naver.blog_total < 0
      ? "조회 안 됨"
      : naver.blog_total === 0
      ? "결과 없음"
      : naver.blog_rank
        ? `우리 블로그 ${naver.blog_rank}위`
        : `상위 ${naver.blog_total}개 중 우리 블로그 없음`;
  return (
    <div className="px-4 py-2 border-b border-gray-100 bg-emerald-50/40 text-xs text-gray-600">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-emerald-700">네이버 「{naver.search_keyword}」</span>
        <span>플레이스 {rankLabel(naver.local_rank, naver.local_total)}</span>
        <span>
          블로그 {blog}
          {naver.blog_mention_count > 0 && ` · 병원 이름 언급 ${naver.blog_mention_count}건`}
        </span>
        <span>웹문서 {rankLabel(naver.web_rank, naver.web_total)}</span>
        <button className="text-emerald-700 hover:underline ml-auto" onClick={() => setOpen((v) => !v)}>
          {open ? "접기" : "상위 결과 보기"}
        </button>
      </div>
      {open && (
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          <div>
            <div className="text-[11px] text-gray-400 mb-1">플레이스 상위</div>
            <ol className="space-y-0.5">
              {naver.top_local.map((l, i) => (
                <li key={i} className={l.ours ? "text-blue-700 font-semibold" : ""}>
                  {i + 1}. {l.title} <span className="text-gray-400">{l.address}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <div className="text-[11px] text-gray-400 mb-1">블로그 상위</div>
            <ol className="space-y-0.5">
              {naver.top_blogs.map((b, i) => (
                <li key={i} className="truncate">
                  {i + 1}.{" "}
                  <a
                    href={b.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={b.own ? "text-blue-700 font-semibold" : b.mentions ? "text-emerald-700" : "hover:underline"}
                  >
                    {b.title}
                  </a>{" "}
                  <span className="text-gray-400">{b.blogger}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function KeywordCard({
  nameVariants,
  clientType,
  keywordText,
  results,
  naver,
}: {
  nameVariants: string[];
  clientType: ClientType;
  keywordText: string;
  results: ResultWithKeyword[];
  naver?: NaverResult;
}) {
  const competitorLabel = clientType === "hospital" ? "경쟁 병원" : "경쟁 업체";
  const providers = providersIn(results);
  const mentionedCount = results.filter((r) => r.mentioned).length;
  const overallRate = Math.round((mentionedCount / results.length) * 100);
  const margin = marginOfError(mentionedCount, results.length);

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
        <span className="text-xs text-gray-500" title="같은 질문을 다시 물으면 이 범위 안에서 달라질 수 있습니다 (95% 신뢰구간)">
          AI 추천 확률 <b className="text-gray-800">{overallRate}%</b>
          {margin !== null && <span className="text-gray-400"> ±{margin}%p</span>} ({mentionedCount}/{results.length}회)
        </span>
      </div>

      {naver && <NaverLine naver={naver} />}

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
        {active.query_text && active.query_text !== active.keyword_text && (
          <div className="text-xs text-gray-500 mb-2">
            이 회차에 보낸 질문: <span className="text-gray-700">{active.query_text}</span>
          </div>
        )}
        {active.mentioned && active.evidence && (
          <div className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 mb-2">
            판정 근거: {active.evidence}
          </div>
        )}
        <div className="border border-gray-100 rounded-lg p-3 max-h-72 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap bg-gray-50/60">
          {active.raw_response ? highlight(stripMarkdown(active.raw_response), nameVariants) : "응답 없음"}
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

export function ExposureStatus({
  clientName,
  clientAliases = [],
  naverResults = [],
  clientType,
  results,
  runs,
  selectedRunId,
  onSelectRun,
}: Props) {
  const groups = useMemo(() => groupByKeyword(results), [results]);
  const nameVariants = useMemo(() => clientNameVariants(clientName, clientAliases), [clientName, clientAliases]);

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
            nameVariants={nameVariants}
            clientType={clientType}
            keywordText={keywordTextOf(group[0])}
            results={group}
            naver={naverResults.find((n) => n.keyword_id && n.keyword_id === group[0].keyword_id)}
          />
        ))
      )}
    </div>
  );
}
