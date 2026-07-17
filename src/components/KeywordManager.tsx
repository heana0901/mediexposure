"use client";

import { useState } from "react";
import type { Keyword } from "@/lib/types";

type Props = {
  keywords: Keyword[];
  onAddKeyword: (text: string) => Promise<void>;
  onDeleteKeyword: (id: string) => Promise<void>;
};

export function KeywordManager({ keywords, onAddKeyword, onDeleteKeyword }: Props) {
  const [newKeyword, setNewKeyword] = useState("");

  async function handleAddKeyword() {
    if (!newKeyword.trim()) return;
    const text = newKeyword.trim();
    setNewKeyword("");
    await onAddKeyword(text);
  }

  return (
    <div className="w-full border rounded-xl bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">모니터링 질문</span>
        <span className="text-xs text-gray-400">{keywords.length}개</span>
      </div>

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
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
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
