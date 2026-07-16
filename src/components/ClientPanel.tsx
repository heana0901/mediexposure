"use client";

import { useState } from "react";
import type { Client, Keyword } from "@/lib/types";

type Props = {
  clients: Client[];
  selectedClientId: string | null;
  onSelectClient: (id: string) => void;
  onCreateClient: (name: string) => Promise<void>;
  keywords: Keyword[];
  onAddKeyword: (text: string) => Promise<void>;
  onDeleteKeyword: (id: string) => Promise<void>;
  onRunMonitoring: () => Promise<void>;
  isRunning: boolean;
};

export function ClientPanel({
  clients,
  selectedClientId,
  onSelectClient,
  onCreateClient,
  keywords,
  onAddKeyword,
  onDeleteKeyword,
  onRunMonitoring,
  isRunning,
}: Props) {
  const [newClientName, setNewClientName] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  async function handleCreateClient() {
    if (!newClientName.trim()) return;
    setCreatingClient(true);
    try {
      await onCreateClient(newClientName.trim());
      setNewClientName("");
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleAddKeyword() {
    if (!newKeyword.trim()) return;
    const text = newKeyword.trim();
    setNewKeyword("");
    await onAddKeyword(text);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <select
        className="border rounded-lg px-3 py-2 text-sm min-w-[160px]"
        value={selectedClientId ?? ""}
        onChange={(e) => onSelectClient(e.target.value)}
      >
        <option value="" disabled>
          클라이언트 선택
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <input
          className="border rounded-lg px-3 py-2 text-sm w-40"
          placeholder="새 병원명 입력"
          value={newClientName}
          onChange={(e) => setNewClientName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateClient()}
        />
        <button
          className="text-sm px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
          disabled={creatingClient || !newClientName.trim()}
          onClick={handleCreateClient}
        >
          + 클라이언트 추가
        </button>
      </div>

      <button
        className="ml-auto flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        disabled={!selectedClientId || keywords.length === 0 || isRunning}
        onClick={onRunMonitoring}
      >
        {isRunning ? "모니터링 실행 중..." : "▶ 모니터링 실행"}
      </button>

      {selectedClientId && (
        <div className="w-full border rounded-xl bg-white p-4">
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
      )}
    </div>
  );
}
