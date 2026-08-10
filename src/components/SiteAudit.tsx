"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SiteComparisonResult } from "@/lib/siteAudit";
import { IconGlobe } from "./icons";

const STATUS_STYLE: Record<string, { badge: string; icon: string }> = {
  pass: { badge: "bg-green-50 text-green-600", icon: "✓" },
  warn: { badge: "bg-amber-50 text-amber-600", icon: "!" },
  fail: { badge: "bg-red-50 text-red-500", icon: "✕" },
};

type Props = {
  clientId?: string | null;
  savedClientName?: string | null;
  savedUrl?: string | null;
  onSaveUrl?: (url: string) => Promise<void>;
};

export function SiteAudit({ clientId = null, savedClientName = null, savedUrl = null, onSaveUrl }: Props) {
  const [url, setUrl] = useState(savedUrl ?? "");
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SiteComparisonResult | null>(null);
  const [resultDate, setResultDate] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

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
    try {
      const data = await api.runSiteAudit(urls, clientId ?? undefined);
      setResult(data);
      setResultDate(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const isComparison = (result?.sites.length ?? 0) > 1;

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
            <span className="text-xs text-gray-400">
              {savedUrl && url.trim() === savedUrl
                ? `📌 ${savedClientName}에 저장된 홈페이지`
                : `${savedClientName} 선택됨`}
            </span>
          )}
        </div>
        <div className="flex gap-2 mb-2">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="예: https://mystore.com (분석 대상)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {onSaveUrl && (
            <button
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap shrink-0"
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
              className="text-xs text-gray-400 hover:text-red-500 px-2"
              onClick={() => removeCompetitorField(i)}
            >
              삭제
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between mt-2">
          {competitorUrls.length < 2 ? (
            <button className="text-xs text-blue-600 hover:text-blue-700" onClick={addCompetitorField}>
              + 비교할 경쟁사 URL 추가
            </button>
          ) : (
            <span />
          )}
          <button
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50 whitespace-nowrap"
            disabled={!url.trim() || loading}
            onClick={handleAnalyze}
          >
            {loading ? "분석 중..." : "분석 시작"}
          </button>
        </div>
        {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
      </div>

      {result && (
        <>
          <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-700">AI 검색 노출 체크리스트</div>
              {resultDate && (
                <span className="text-xs text-gray-400">
                  {new Date(resultDate).toLocaleString("ko-KR")} 분석
                </span>
              )}
            </div>

            {!isComparison ? (
              <div className="space-y-2">
                {result.sites[0].checks.map((check) => {
                  const style = STATUS_STYLE[check.status];
                  return (
                    <div key={check.key} className="flex items-start gap-3 border border-gray-100 rounded-lg p-3">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${style.badge}`}
                      >
                        {style.icon}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-gray-800">{check.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{check.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="py-2 font-normal">항목</th>
                    {result.sites.map((s, i) => (
                      <th key={s.url} className="py-2 font-normal px-2 truncate max-w-[160px]">
                        {i === 0 ? "🔵 " : ""}
                        {s.title || s.url}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.sites[0].checks.map((check, checkIdx) => (
                    <tr key={check.key} className="border-b border-gray-100 last:border-0">
                      <td className="py-2.5 text-gray-700 pr-3">{check.label}</td>
                      {result.sites.map((s) => {
                        const c = s.checks[checkIdx];
                        const style = c ? STATUS_STYLE[c.status] : STATUS_STYLE.warn;
                        return (
                          <td key={s.url} className="py-2.5 px-2">
                            <span
                              className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold ${style.badge}`}
                              title={c?.detail}
                            >
                              {style.icon}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {result.aiComment && (
            <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
              <div className="text-sm font-medium text-gray-700 mb-2">
                {isComparison ? "AI 검색 관점 비교 진단" : "AI 검색 관점 진단"}
              </div>
              <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{result.aiComment}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
