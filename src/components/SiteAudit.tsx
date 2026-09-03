"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  AXIS_META,
  AXIS_ORDER,
  isLegacySite,
  scoreTone,
  type Axis,
  type CheckResult,
  type CheckStatus,
  type SiteComparisonResult,
  type SiteDiagnosis,
} from "@/lib/diagnose-shared";
import { IconGlobe, IconCheck, IconAlertTriangle, IconX, IconLoader, IconBookmark } from "./icons";

const STATUS_STYLE: Record<CheckStatus, { badge: string; label: string; Icon: typeof IconCheck }> = {
  pass: { badge: "bg-green-50 text-green-600", label: "이상 없음", Icon: IconCheck },
  warn: { badge: "bg-amber-50 text-amber-600", label: "손볼 곳", Icon: IconAlertTriangle },
  fail: { badge: "bg-red-50 text-red-500", label: "꼭 고칠 것", Icon: IconX },
};

const AXIS_TINT: Record<Axis, string> = {
  seo: "bg-blue-50 text-blue-600",
  aeo: "bg-violet-50 text-violet-600",
  geo: "bg-teal-50 text-teal-600",
  naver: "bg-emerald-50 text-emerald-600",
};

const PROGRESS_STEPS = [
  "홈페이지에 접속하는 중",
  "SEO 기술 항목 검사 중",
  "AI 인용 준비도(AEO) 확인 중",
  "엔티티 구조화 데이터(GEO) 점검 중",
  "네이버 대응 항목 확인 중",
  "종합 점수 계산 중",
];

/**
 * 구버전 기록({key,label} 형식)도 그대로 열람할 수 있도록 새 형식으로 변환합니다.
 * 점수 체계가 없던 시절 기록이므로 score는 null로 두고 화면에서 점수 영역을 숨깁니다.
 */
type ViewSite = SiteDiagnosis & { legacy: boolean };

function toViewSites(result: SiteComparisonResult): ViewSite[] {
  return result.sites.map((site) => {
    if (!isLegacySite(site)) return { ...site, legacy: false };
    return {
      url: site.url,
      finalUrl: site.finalUrl,
      title: site.title,
      score: 0,
      grade: "개선 필요" as const,
      responseMs: 0,
      axes: [],
      checks: site.checks.map<CheckResult>((c) => ({
        id: c.key,
        axis: "seo",
        name: c.label,
        detail: c.detail,
        status: c.status,
        weight: 0,
      })),
      priorities: [],
      error: null,
      legacy: true,
    };
  });
}

function ScoreDial({ score, grade }: { score: number; grade: string }) {
  const tone = scoreTone(score);
  const circumference = 2 * Math.PI * 42;
  return (
    <div className="relative w-[112px] h-[112px] shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={tone}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(Math.max(score, 0), 100) / 100)}
          style={{ transition: "stroke-dashoffset 900ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold leading-none" style={{ color: tone }}>
          {score}
        </span>
        <span className="text-[11px] text-gray-400 mt-1">/ 100</span>
        <span className="text-[11px] font-medium mt-0.5" style={{ color: tone }}>
          {grade}
        </span>
      </div>
    </div>
  );
}

function AxisBars({ site }: { site: ViewSite }) {
  return (
    <div className="flex-1 space-y-2.5 min-w-0">
      {site.axes.map((axis) => {
        const meta = AXIS_META[axis.axis];
        return (
          <div key={axis.axis}>
            <div className="flex items-baseline justify-between text-xs mb-1 gap-2">
              <span className="text-gray-600 truncate">
                <span className="font-medium text-gray-700">{meta.short}</span>
                <span className="text-gray-400 ml-1.5 hidden sm:inline">{meta.description}</span>
              </span>
              <span className="text-gray-500 shrink-0 tabular-nums">
                {axis.score}점
                <span className="text-gray-300 ml-1">
                  ({axis.passed}/{axis.total})
                </span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${axis.score}%`,
                  backgroundColor: scoreTone(axis.score),
                  transition: "width 900ms ease-out",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  const style = STATUS_STYLE[check.status];
  return (
    <div className="flex items-start gap-3 border border-gray-100 rounded-lg p-3">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${style.badge}`}>
        <style.Icon className="w-3.5 h-3.5" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">{check.name}</span>
          {check.weight > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${AXIS_TINT[check.axis]}`}>
              {AXIS_META[check.axis].short}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5 break-words">{check.detail}</div>
        {check.fix && (
          <div className="text-xs text-gray-600 mt-1.5 bg-gray-50 rounded-md px-2 py-1.5 leading-relaxed">
            {check.fix}
          </div>
        )}
      </div>
    </div>
  );
}

export function SiteAudit({
  clientId = null,
  savedClientName = null,
  savedUrl = null,
  onSaveUrl,
}: {
  clientId?: string | null;
  savedClientName?: string | null;
  savedUrl?: string | null;
  onSaveUrl?: (url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(savedUrl ?? "");
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SiteComparisonResult | null>(null);
  const [resultDate, setResultDate] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [openAxis, setOpenAxis] = useState<Axis | "all">("all");
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 선택된 클라이언트가 바뀌면(사이드바에서 다른 병원 선택) 그 병원에 저장된 URL로 초기화
  const [syncedClientName, setSyncedClientName] = useState(savedClientName);
  if (savedClientName !== syncedClientName) {
    setSyncedClientName(savedClientName);
    setUrl(savedUrl ?? "");
    setCompetitorUrls([]);
    setResult(null);
    setResultDate(null);
  }

  // 그 병원에 저장된 마지막 분석 기록을 불러온다 (새로 분석하기 전까지는 이 기록을 보여줌)
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    api
      .getLatestSiteAudit(clientId)
      .then((saved) => {
        if (cancelled || !saved) return;
        setResult(saved.result);
        setResultDate(saved.created_at);
        if (Array.isArray(saved.urls) && saved.urls.length > 1) {
          setCompetitorUrls(saved.urls.slice(1));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  async function handleSaveUrl() {
    if (!onSaveUrl) return;
    setSavingUrl(true);
    try {
      await onSaveUrl(url.trim());
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSavingUrl(false);
    }
  }

  function addCompetitorField() {
    if (competitorUrls.length >= 2) return;
    setCompetitorUrls((prev) => [...prev, ""]);
  }

  function updateCompetitorUrl(index: number, value: string) {
    setCompetitorUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function removeCompetitorField(index: number) {
    setCompetitorUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAnalyze() {
    if (!url.trim()) return;
    const urls = [url.trim(), ...competitorUrls.map((u) => u.trim()).filter(Boolean)];
    setLoading(true);
    setError(null);
    setResult(null);
    setOpenAxis("all");

    // 진단은 보통 2~6초 걸립니다. 단계 표시를 돌려 기다리는 동안 이탈을 줄입니다.
    setProgressStep(0);
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setProgressStep((s) => Math.min(s + 1, PROGRESS_STEPS.length - 1));
    }, 1400);

    try {
      const data = await api.runSiteAudit(urls, clientId ?? undefined);
      setResult(data);
      setResultDate(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (progressTimer.current) clearInterval(progressTimer.current);
      progressTimer.current = null;
      setLoading(false);
    }
  }

  const sites = result ? toViewSites(result) : [];
  const primary = sites[0] ?? null;
  const isComparison = sites.length > 1;
  const isLegacyRecord = Boolean(primary?.legacy);

  const visibleChecks =
    primary && (openAxis === "all" ? primary.checks : primary.checks.filter((c) => c.axis === openAxis));

  return (
    <div className="space-y-4">
      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <IconGlobe className="w-4 h-4" />
            </span>
            <span className="text-sm font-medium text-gray-700">홈페이지 URL 입력</span>
          </div>
          {savedClientName && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              {savedUrl && url.trim() === savedUrl ? (
                <>
                  <IconBookmark className="w-3 h-3 text-blue-500" />
                  {savedClientName}에 저장된 홈페이지
                </>
              ) : (
                `${savedClientName} 선택됨`
              )}
            </span>
          )}
        </div>
        <div className="flex gap-2 mb-2">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="예: hospital.co.kr (분석 대상)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleAnalyze();
            }}
          />
          {onSaveUrl && (
            <button
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.96] disabled:active:scale-100 transition-[transform,background-color] disabled:opacity-50 whitespace-nowrap shrink-0"
              disabled={savingUrl || !url.trim() || url.trim() === savedUrl}
              onClick={handleSaveUrl}
            >
              {savingUrl ? "저장 중..." : savedFlash ? "저장됨" : "이 URL 저장"}
            </button>
          )}
        </div>

        {competitorUrls.map((cUrl, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="비교할 경쟁사 URL"
              value={cUrl}
              onChange={(e) => updateCompetitorUrl(i, e.target.value)}
            />
            <button
              className="text-xs text-gray-400 hover:text-red-500 active:scale-[0.96] transition-[transform,color] px-2"
              onClick={() => removeCompetitorField(i)}
            >
              삭제
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between mt-2">
          {competitorUrls.length < 2 ? (
            <button
              className="text-xs text-blue-600 hover:text-blue-700 active:scale-[0.96] transition-transform"
              onClick={addCompetitorField}
            >
              + 비교할 경쟁사 URL 추가
            </button>
          ) : (
            <span />
          )}
          <button
            className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 active:scale-[0.96] disabled:active:scale-100 transition-[transform,background-color] disabled:opacity-50 whitespace-nowrap"
            disabled={!url.trim() || loading}
            onClick={handleAnalyze}
          >
            {loading && <IconLoader className="w-3.5 h-3.5 animate-spin" />}
            {loading ? "분석 중..." : "분석 시작"}
          </button>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-3">
            <IconLoader className="w-3 h-3 animate-spin text-blue-500" />
            {PROGRESS_STEPS[progressStep]}
            <span className="text-gray-300">
              ({progressStep + 1}/{PROGRESS_STEPS.length})
            </span>
          </div>
        )}
        {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
        <div className="text-[11px] text-gray-400 mt-3 leading-relaxed">
          서버가 처음 받는 HTML의 첫 페이지 한 장을 25개 항목으로 검사합니다. 자바스크립트로 나중에 그리는
          내용은 보지 않습니다 — 검색엔진과 AI도 같은 조건에서 봅니다.
        </div>
      </div>

      {primary && (
        <>
          {primary.error ? (
            <div className="animate-fade-in-up border border-red-100 bg-red-50/50 rounded-xl p-4 text-sm text-red-600">
              {primary.error}
            </div>
          ) : (
            <>
              {!isLegacyRecord && (
                <div className="animate-fade-in-up border border-gray-100 rounded-xl bg-white shadow-sm p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-medium text-gray-700">AI 검색 노출 종합 점수</div>
                    {resultDate && (
                      <span className="text-xs text-gray-400">
                        {new Date(resultDate).toLocaleString("ko-KR")} 분석
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <ScoreDial score={primary.score} grade={primary.grade} />
                    <AxisBars site={primary} />
                  </div>
                  <div className="text-[11px] text-gray-400 mt-4 pt-3 border-t border-gray-50">
                    {primary.finalUrl} · 응답 {(primary.responseMs / 1000).toFixed(1)}초 · 25개 항목 중{" "}
                    {primary.checks.filter((c) => c.status === "pass").length}개 통과
                  </div>
                </div>
              )}

              {primary.priorities.length > 0 && (
                <div
                  className="animate-fade-in-up border border-gray-100 rounded-xl bg-white shadow-sm p-4"
                  style={{ animationDelay: "60ms" }}
                >
                  <div className="text-sm font-medium text-gray-700 mb-3">
                    먼저 고칠 것 <span className="text-gray-400 font-normal">· 점수에 미치는 영향 순</span>
                  </div>
                  <div className="space-y-2.5">
                    {primary.priorities.map((p, i) => (
                      <div key={p.name} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">{p.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${AXIS_TINT[p.axis]}`}>
                              {AXIS_META[p.axis].short}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1 leading-relaxed">{p.fix}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isComparison && !isLegacyRecord && (
                <div
                  className="animate-fade-in-up border border-gray-100 rounded-xl bg-white shadow-sm p-4 overflow-x-auto"
                  style={{ animationDelay: "100ms" }}
                >
                  <div className="text-sm font-medium text-gray-700 mb-3">경쟁사 비교</div>
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b">
                        <th className="py-2 font-normal">사이트</th>
                        <th className="py-2 font-normal px-2 text-right">총점</th>
                        {AXIS_ORDER.map((axis) => (
                          <th key={axis} className="py-2 font-normal px-2 text-right">
                            {AXIS_META[axis].short}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sites.map((s, i) => (
                        <tr key={s.url} className="border-b border-gray-100 last:border-0">
                          <td className="py-2.5 pr-3 text-gray-700">
                            <span className="inline-flex items-center gap-1.5 max-w-[220px]">
                              {i === 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                              <span className="truncate">{s.title || s.url}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right font-medium tabular-nums">
                            {s.error ? (
                              <span className="text-xs text-red-500">진단 실패</span>
                            ) : (
                              <span style={{ color: scoreTone(s.score) }}>{s.score}</span>
                            )}
                          </td>
                          {AXIS_ORDER.map((axis) => {
                            const found = s.axes.find((a) => a.axis === axis);
                            return (
                              <td key={axis} className="py-2.5 px-2 text-right text-gray-600 tabular-nums">
                                {found ? found.score : "–"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div
                className="animate-fade-in-up border border-gray-100 rounded-xl bg-white shadow-sm p-4"
                style={{ animationDelay: "140ms" }}
              >
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <div className="text-sm font-medium text-gray-700">
                    체크리스트{!isLegacyRecord && <span className="text-gray-400 font-normal"> · 25개 항목</span>}
                  </div>
                  {!isLegacyRecord && (
                    <div className="flex gap-1 flex-wrap">
                      {(["all", ...AXIS_ORDER] as const).map((axis) => (
                        <button
                          key={axis}
                          onClick={() => setOpenAxis(axis)}
                          className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                            openAxis === axis
                              ? "bg-gray-800 text-white"
                              : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          {axis === "all" ? "전체" : AXIS_META[axis].short}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {visibleChecks?.map((check) => (
                    <CheckRow key={check.id} check={check} />
                  ))}
                </div>
                {isLegacyRecord && (
                  <div className="text-[11px] text-gray-400 mt-3">
                    이전 버전에서 저장된 기록입니다. 다시 분석하면 25개 항목·100점 진단으로 갱신됩니다.
                  </div>
                )}
              </div>
            </>
          )}

          {result?.aiComment && (
            <div
              className="animate-fade-in-up border border-gray-100 rounded-xl bg-white shadow-sm p-4"
              style={{ animationDelay: "180ms" }}
            >
              <div className="text-sm font-medium text-gray-700 mb-2">
                {isComparison ? "AI 검색 관점 비교 진단" : "AI 검색 관점 진단"}
              </div>
              <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {result.aiComment}
              </div>
            </div>
          )}

          {!result?.aiComment && result?.aiCommentError && (
            <div className="animate-fade-in-up border border-amber-100 bg-amber-50/60 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
              {result.aiCommentError}
              <div className="text-amber-600/70 mt-1">
                위 점수와 체크리스트는 AI를 쓰지 않고 계산하므로 그대로 신뢰할 수 있습니다.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
