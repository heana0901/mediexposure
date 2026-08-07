"use client";

import { useState } from "react";
import type { Keyword } from "@/lib/types";

type Props = {
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

export function KeywordManager({ keywords, onAddKeyword, onAddKeywordsBulk, onDeleteKeyword }: Props) {
  const [newKeyword, setNewKeyword] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

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
            onClick={() => setBulkOpen((v) => !v)}
          >
            {bulkOpen ? "일괄 등록 닫기" : "일괄 등록"}
          </button>
        </div>
      </div>

      {bulkOpen && (
        <BulkAddForm onSubmit={onAddKeywordsBulk} onClose={() => setBulkOpen(false)} />
      )}

      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {keywords.map((k) => (
            <span
              key={k.id}
              className="flex items-center gap-1 bg-gray-100 text-sm rounded-full px-3 py-1"
            >
              {k.text}
              <button
                className="text-gray-400 hover:text-red-500"
                onClick={() => onDeleteKeyword(k.id)}
                aria-label="삭제"
              >
                ×
              </button>
            </span>
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
