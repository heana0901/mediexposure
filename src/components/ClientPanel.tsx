"use client";

import { useState } from "react";
import type { Client, ClientInput, Keyword } from "@/lib/types";
import { NewClientForm } from "./NewClientForm";

type Props = {
  clients: Client[];
  selectedClientId: string | null;
  onSelectClient: (id: string) => void;
  onCreateClient: (input: ClientInput) => Promise<void>;
  keywords: Keyword[];
  onAddKeyword: (text: string) => Promise<void>;
  onDeleteKeyword: (id: string) => Promise<void>;
  onRunMonitoring: () => Promise<void>;
  isRunning: boolean;
};

function clientLabel(c: Client) {
  return c.region ? `${c.name} (${c.region})` : c.name;
}

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
  const [newKeyword, setNewKeyword] = useState("");
  const [showNewClientForm, setShowNewClientForm] = useState(false);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  async function handleAddKeyword() {
    if (!newKeyword.trim()) return;
    const text = newKeyword.trim();
    setNewKeyword("");
    await onAddKeyword(text);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <select
        className="border rounded-lg px-3 py-2 text-sm min-w-[200px]"
        value={selectedClientId ?? ""}
        onChange={(e) => onSelectClient(e.target.value)}
      >
        <option value="" disabled>
          클라이언트 선택
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {clientLabel(c)}
          </option>
        ))}
      </select>

      <button
        className="text-sm px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
        onClick={() => setShowNewClientForm((v) => !v)}
      >
        + 클라이언트 추가
      </button>

      <button
        className="ml-auto flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        disabled={!selectedClientId || keywords.length === 0 || isRunning}
        onClick={onRunMonitoring}
      >
        {isRunning ? "모니터링 실행 중..." : "▶ 모니터링 실행"}
      </button>

      {showNewClientForm && (
        <NewClientForm
          onCreate={onCreateClient}
          onClose={() => setShowNewClientForm(false)}
        />
      )}

      {selectedClient && (
        <div className="w-full flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 -mt-1">
          {selectedClient.department && <span>진료과목: {selectedClient.department}</span>}
          {selectedClient.director_name && <span>대표원장: {selectedClient.director_name}</span>}
          {selectedClient.is_specialist !== null && (
            <span>{selectedClient.is_specialist ? "전문의" : "전문의 아님"}</span>
          )}
          {selectedClient.region && <span>지역: {selectedClient.region}</span>}
        </div>
      )}

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
