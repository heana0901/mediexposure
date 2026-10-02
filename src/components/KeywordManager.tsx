"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Keyword, KeywordIdea } from "@/lib/types";

type Props = {
  clientId: string;
  keywords: Keyword[];
  onAddKeyword: (text: string) => Promise<void>;
  onAddKeywordsBulk: (texts: string[]) => Promise<void>;
  onDeleteKeyword: (id: string) => Promise<void>;
};

function BulkAddForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (texts: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  async function handleSubmit() {
    if (lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(lines);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-gray-100 rounded-lg p-3 mb-3 bg-gray-50/60 space-y-2">
      <div className="text-xs text-gray-500">한 줄에 질문 하나씩 입력하세요</div>
      <textarea
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white h-28 resize-y"
        placeholder={"예:\n안산 정형외과\n안산 신경외과\n안산 척추내시경"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{lines.length}개 등록 예정</span>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-red-500">{error}</span>}
          <button className="text-xs text-gray-400 hover:text-gray-600" onClick={onClose}>
            취소
          </button>
          <button
            className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
            disabled={lines.length === 0 || saving}
            onClick={handleSubmit}
          >
            {saving ? "등록 중..." : `${lines.length || ""}개 등록`}
          </button>
        </div>
      </div>
    </div>
  );
}

const COMPETITION_LABEL: Record<string, string> = { 높음: "광고 경쟁 높음", 중간: "광고 경쟁 중간", 낮음: "광고 경쟁 낮음" };

/** 네이버 연관 키워드를 검색량 순으로 보여주고 골라서 질문으로 추가한다 */
function IdeasPanel({
  clientId,
  onAdd,
  onClose,
}: {
  clientId: string;
  onAdd: (texts: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [seeds, setSeeds] = useState("");
  const [ideas, setIdeas] = useState<KeywordIdea[] | null>(null);
  const [usedSeeds, setUsedSeeds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getKeywordIdeas(clientId, seeds.trim() || undefined);
      setIdeas(res.ideas);
      setUsedSeeds(res.seeds);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function add() {
    setSaving(true);
    setError(null);
    try {
      await onAdd([...selected]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function toggle(keyword: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }

  return (
    <div className="border border-gray-100 rounded-lg p-3 mb-3 bg-gray-50/60 space-y-2">
      <div className="text-xs text-gray-500">
        네이버에서 실제로 많이 검색되는 키워드를 찾아 질문으로 추가합니다. 비워두면 지역·진료과와 지금 질문들로
        찾습니다.
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          placeholder="예: 안산 척추, 허리디스크 (쉼표로 구분)"
          value={seeds}
          onChange={(e) => setSeeds(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && find()}
        />
        <button
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-50"
          disabled={loading}
          onClick={find}
        >
          {loading ? "찾는 중..." : "찾기"}
        </button>
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}

      {ideas && (
        <>
          <div className="text-[11px] text-gray-400">기준 키워드: {usedSeeds.join(", ")}</div>
          {ideas.length === 0 ? (
            <div className="text-xs text-gray-400 py-3 text-center">새로 추가할 만한 키워드가 없습니다</div>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 bg-white rounded-lg border border-gray-100">
              {ideas.map((idea) => (
                <li key={idea.keyword}>
                  <label className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selected.has(idea.keyword)}
                      onChange={() => toggle(idea.keyword)}
                    />
                    <span className="flex-1 min-w-0 truncate text-gray-800">{idea.keyword}</span>
                    {idea.brand && (
                      <span className="text-[10px] text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 shrink-0">우리 병원 이름</span>
                    )}
                    {idea.competitorBrand && (
                      <span className="text-[10px] text-gray-600 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">
                        경쟁: {idea.competitorBrand}
                      </span>
                    )}
                    {idea.competition && (
                      <span className="text-[10px] text-gray-400 shrink-0">{COMPETITION_LABEL[idea.competition] ?? idea.competition}</span>
                    )}
                    <span className="text-xs text-gray-600 w-20 text-right shrink-0">
                      {idea.approx ? "10회 미만" : `월 ${idea.volume.toLocaleString()}`}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-3">
            <button className="text-xs text-gray-400 hover:text-gray-600" onClick={onClose}>
              닫기
            </button>
            <button
              className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
              disabled={selected.size === 0 || saving}
              onClick={add}
            >
              {saving ? "추가 중..." : `선택한 ${selected.size}개 질문 추가`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function volumeLabel(k: Keyword): string | null {
  if (k.search_volume === null || k.search_volume === undefined) return null;
  if (k.search_volume_note) return k.search_volume_note;
  return `월 ${k.search_volume.toLocaleString()}회 검색`;
}

export function KeywordManager({ clientId, keywords, onAddKeyword, onAddKeywordsBulk, onDeleteKeyword }: Props) {
  const [newKeyword, setNewKeyword] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);

  async function handleAddKeyword() {
    if (!newKeyword.trim()) return;
    const text = newKeyword.trim();
    setNewKeyword("");
    await onAddKeyword(text);
  }

  return (
    <div className="w-full border border-gray-100 rounded-xl bg-white shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">모니터링 질문</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{keywords.length}개</span>
          <button
            className="text-xs text-blue-600 hover:text-blue-700"
            onClick={() => setIdeasOpen((v) => !v)}
          >
            {ideasOpen ? "질문 추천 닫기" : "질문 추천"}
          </button>
          <button
            className="text-xs text-blue-600 hover:text-blue-700"
            onClick={() => setBulkOpen((v) => !v)}
          >
            {bulkOpen ? "일괄 등록 닫기" : "일괄 등록"}
          </button>
        </div>
      </div>

      {ideasOpen && (
        <IdeasPanel key={clientId} clientId={clientId} onAdd={onAddKeywordsBulk} onClose={() => setIdeasOpen(false)} />
      )}

      {bulkOpen && (
        <BulkAddForm onSubmit={onAddKeywordsBulk} onClose={() => setBulkOpen(false)} />
      )}

      {keywords.length > 0 && (
        <div className="space-y-2 mb-3">
          {keywords.map((k) => (
            <div key={k.id}>
              <span className="inline-flex items-center gap-1 bg-gray-100 text-sm rounded-full px-3 py-1">
                {k.text}
                <button
                  className="text-gray-400 hover:text-red-500"
                  onClick={() => onDeleteKeyword(k.id)}
                  aria-label="삭제"
                >
                  ×
                </button>
              </span>
              {volumeLabel(k) && (
                <span className="text-[11px] text-gray-500 ml-2" title={k.search_keyword ? `네이버 대표 검색어: ${k.search_keyword}` : undefined}>
                  {volumeLabel(k)}
                </span>
              )}
              {(k.variants ?? []).length > 0 && (
                <div className="text-[11px] text-gray-400 mt-1 ml-3">
                  함께 묻는 표현: {(k.variants ?? []).join(" · ")}
                </div>
              )}
              {k.variant_note && (
                <div className="text-[11px] text-amber-600 mt-1 ml-3">⚠ {k.variant_note}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
          placeholder="질문 입력 후 Enter"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
        />
        <button
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
          disabled={!newKeyword.trim()}
          onClick={handleAddKeyword}
        >
          + 추가
        </button>
      </div>
    </div>
  );
}
