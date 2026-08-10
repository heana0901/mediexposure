"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { SiteAuditResult } from "@/lib/siteAudit";
import { IconGlobe } from "./icons";

const STATUS_STYLE: Record<string, { badge: string; icon: string }> = {
  pass: { badge: "bg-green-50 text-green-600", icon: "✓" },
  warn: { badge: "bg-amber-50 text-amber-600", icon: "!" },
  fail: { badge: "bg-red-50 text-red-500", icon: "✕" },
};

export function SiteAudit() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SiteAuditResult | null>(null);

  async function handleAnalyze() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.runSiteAudit(url.trim());
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <IconGlobe className="w-4 h-4" />
          </span>
          <span className="text-sm font-medium text-gray-700">홈페이지 URL 입력</span>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="예: https://mystore.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
          />
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
          <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
            <div className="text-sm font-medium text-gray-700 mb-3">AI 검색 노출 체크리스트</div>
            <div className="space-y-2">
              {result.checks.map((check) => {
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
          </div>

          {result.aiComment && (
            <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
              <div className="text-sm font-medium text-gray-700 mb-2">AI 검색 관점 진단</div>
              <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{result.aiComment}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
