"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ClientType, Keyword, ManualCheckWithComparison, ManualChecksResponse } from "@/lib/types";
import { PROVIDER_META, PROVIDERS, providerKeys, type Provider } from "@/lib/providers";
import { highlight } from "./ExposureStatus";
import { IconCheck, IconX } from "./icons";

type Props = {
  clientId: string;
  clientName: string;
  clientType: ClientType;
  keywords: Keyword[];
};

/** 브라우저 기준 오늘 날짜(YYYY-MM-DD) */
function today(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function realLabel(check: { mentioned: boolean; rank: number | null }) {
  if (!check.mentioned) return "미노출";
  return check.rank ? `노출 · ${check.rank}위` : "노출";
}

function AgreementBadge({ agrees }: { agrees: boolean | null }) {
  if (agrees === null) {
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">비교할 측정 없음</span>;
  }
  return agrees ? (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
      <IconCheck className="w-3 h-3" />
      일치
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600">
      <IconX className="w-3 h-3" />
      불일치
    </span>
  );
}

function CheckCard({
  check,
  clientName,
  competitorLabel,
  onDelete,
}: {
  check: ManualCheckWithComparison;
  clientName: string;
  competitorLabel: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = PROVIDER_META[check.provider];

  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-gray-400">{fmtDate(check.checked_at)}</span>
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
          style={{ background: meta.bg, color: meta.color }}
        >
          {meta.label}
        </span>
        <span className="text-gray-800 font-medium">{check.keyword_text}</span>
        <span className="ml-auto flex items-center gap-2">
          <AgreementBadge agrees={check.agrees} />
          <button className="text-xs text-gray-400 hover:text-red-500" onClick={onDelete}>
            삭제
          </button>
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <div className="text-[11px] text-gray-400 mb-0.5">실제 화면</div>
          <div className={check.mentioned ? "text-blue-600 font-semibold" : "text-red-400 font-semibold"}>
            {realLabel(check)}
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <div className="text-[11px] text-gray-400 mb-0.5">
            API 측정{check.api ? ` (${fmtDate(check.api.runAt)} 실행)` : ""}
          </div>
          {check.api ? (
            <div className="text-gray-800">
              <span className="font-semibold">{check.api.rate}%</span>{" "}
              <span className="text-xs text-gray-500">
                ({check.api.samples}회 중 {check.api.hits}회 노출
                {check.api.avgRank ? ` · 평균 ${check.api.avgRank}위` : ""})
              </span>
            </div>
          ) : (
            <div className="text-xs text-gray-400 py-0.5">앞뒤 7일 안에 같은 질문·같은 AI 측정이 없습니다</div>
          )}
        </div>
      </div>

      {check.competitors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="text-xs text-gray-500 mr-1">{competitorLabel}:</span>
          {check.competitors.map((c) => (
            <span key={c} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
              {c}
            </span>
          ))}
        </div>
      )}

      <button className="text-xs text-gray-500 hover:text-blue-600 mt-2" onClick={() => setOpen((v) => !v)}>
        {open ? "답변 원문 접기" : "답변 원문 보기"}
      </button>
      {open && (
        <div className="mt-2 border border-gray-100 rounded-lg p-3 max-h-72 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap bg-gray-50/60">
          {highlight(check.raw_response, clientName)}
        </div>
      )}
    </div>
  );
}

export function RealScreenCheck({ clientId, clientName, clientType, keywords }: Props) {
  const competitorLabel = clientType === "hospital" ? "경쟁 병원" : "경쟁 업체";

  const [data, setData] = useState<ManualChecksResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [keywordId, setKeywordId] = useState(keywords[0]?.id ?? "");
  const [provider, setProvider] = useState<Provider>("chatgpt");
  const [checkedAt, setCheckedAt] = useState(today());
  const [rawResponse, setRawResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function reload() {
    try {
      setData(await api.listManualChecks(clientId));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    api
      .listManualChecks(clientId)
      .then((res) => !cancelled && setData(res))
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function handleSubmit() {
    setSaving(true);
    setFormError(null);
    setSaved(null);
    try {
      const check = await api.addManualCheck(clientId, {
        keywordId: selectedKeywordId,
        provider,
        rawResponse,
        checkedAt,
      });
      setSaved(`저장했습니다 — ${PROVIDER_META[check.provider].label}: ${realLabel(check)}`);
      setRawResponse("");
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 기록을 삭제할까요?")) return;
    try {
      await api.deleteManualCheck(id);
      await reload();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  // 질문 목록이 늦게 오거나 선택한 질문이 지워져도 항상 유효한 질문을 가리키게 한다
  const selectedKeywordId = keywords.some((k) => k.id === keywordId) ? keywordId : (keywords[0]?.id ?? "");

  const summary = data?.summary;
  const agreement = summary && summary.comparable > 0 ? Math.round((summary.matches / summary.comparable) * 100) : null;

  return (
    <div className="space-y-6">
      {data?.setupRequired && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          실제 화면 비교를 쓰려면 Supabase에서 015 마이그레이션(supabase/migrations/015_manual_checks.sql)을 먼저
          실행해 주세요.
        </div>
      )}
      {loadError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{loadError}</div>
      )}

      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
        <div className="font-medium text-sm text-gray-700 mb-1">실제 화면 답변 기록</div>
        <p className="text-xs text-gray-500 leading-relaxed mb-4">
          환자가 쓰는 앱(ChatGPT·Gemini·Perplexity·Claude)에서 질문을 그대로 검색한 뒤 답변 전체를 복사해
          붙여넣으세요. 로그인하지 않은 상태나 시크릿 창에서 검색하면 개인 대화 기록의 영향을 줄일 수 있습니다.
        </p>

        {keywords.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">
            먼저 AI 노출현황 탭에서 모니터링 질문을 등록해 주세요
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
              <select
                className="rounded-lg px-3 py-2 text-sm bg-white border border-gray-200 min-w-0"
                value={selectedKeywordId}
                onChange={(e) => setKeywordId(e.target.value)}
                aria-label="질문"
              >
                {keywords.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.text}
                  </option>
                ))}
              </select>
              <select
                className="rounded-lg px-3 py-2 text-sm bg-white border border-gray-200"
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                aria-label="AI"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_META[p].label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="rounded-lg px-3 py-2 text-sm bg-white border border-gray-200"
                value={checkedAt}
                max={today()}
                onChange={(e) => setCheckedAt(e.target.value)}
                aria-label="검색한 날짜"
              />
            </div>
            <textarea
              className="w-full rounded-lg px-3 py-2 text-sm bg-white border border-gray-200 min-h-36 leading-relaxed"
              placeholder="실제 앱에 나온 답변을 여기에 붙여넣으세요"
              value={rawResponse}
              onChange={(e) => setRawResponse(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:brightness-110 disabled:opacity-40"
                disabled={saving || !rawResponse.trim()}
                onClick={handleSubmit}
              >
                {saving ? "분석 중..." : "분석해서 저장"}
              </button>
              {saved && <span className="text-xs text-green-600">{saved}</span>}
              {formError && <span className="text-xs text-red-500">{formError}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-medium text-sm text-gray-700">API 측정 일치율</div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              실제 화면에서 노출됐는지와, 앞뒤 7일 안의 API 측정이 노출로 봤는지(여러 번 물어 절반 이상 노출)가 같은
              비율입니다.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold text-gray-900">{agreement === null ? "-" : `${agreement}%`}</div>
            <div className="text-xs text-gray-400">
              {summary ? `비교 ${summary.comparable}건 중 ${summary.matches}건 일치` : "불러오는 중"}
            </div>
          </div>
        </div>
        {summary && providerKeys(summary.byProvider).length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
            {providerKeys(summary.byProvider).map((p) => {
              const tally = summary.byProvider[p]!;
              return (
                <span key={p} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: PROVIDER_META[p].color }} />
                  {PROVIDER_META[p].label} {tally.matches}/{tally.comparable} 일치
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-sm text-gray-700">기록</span>
          <span className="text-xs text-gray-400">{data?.checks.length ?? 0}건</span>
        </div>
        {!data || data.checks.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">아직 기록이 없습니다</div>
        ) : (
          <div className="space-y-3">
            {data.checks.map((check) => (
              <CheckCard
                key={check.id}
                check={check}
                clientName={clientName}
                competitorLabel={competitorLabel}
                onDelete={() => handleDelete(check.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
