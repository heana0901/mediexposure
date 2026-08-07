"use client";

import type { Client } from "@/lib/types";

export type Tab = "status" | "competitors" | "trends" | "usage" | "accounts";

type Props = {
  clients: Client[];
  selectedClientId: string | null;
  onSelectClient: (id: string) => void;
  onOpenCreateForm: () => void;
  onOpenEditForm: () => void;
  onDeleteClient: () => void;
  deleting: boolean;
  onRunMonitoring: () => void;
  isRunning: boolean;
  canRun: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  username: string | null;
  isAdmin: boolean;
  onLogout: () => void;
};

const NAV_ITEMS: { key: Tab; label: string; icon: string; adminOnly?: boolean }[] = [
  { key: "status", label: "AI노출현황", icon: "👁" },
  { key: "competitors", label: "경쟁병원분석", icon: "📈" },
  { key: "trends", label: "추이 분석", icon: "📊" },
  { key: "usage", label: "비용 현황", icon: "💳", adminOnly: true },
  { key: "accounts", label: "계정 관리", icon: "👤", adminOnly: true },
];

export function Sidebar({
  clients,
  selectedClientId,
  onSelectClient,
  onOpenCreateForm,
  onOpenEditForm,
  onDeleteClient,
  deleting,
  onRunMonitoring,
  isRunning,
  canRun,
  tab,
  onTabChange,
  username,
  isAdmin,
  onLogout,
}: Props) {
  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  return (
    <aside className="w-72 shrink-0 border-r border-gray-100 bg-white flex flex-col h-full">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
            M
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">MediExposure</div>
            <div className="text-xs text-gray-400 leading-tight">Marketing Dashboard</div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {isAdmin && (
          <button
            className="w-full text-sm px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
            onClick={onOpenCreateForm}
          >
            + 클라이언트 추가
          </button>
        )}

        <select
          className="w-full border rounded-lg px-3 py-2 text-sm"
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

        {selectedClient && (
          <>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
              {selectedClient.department && <span>{selectedClient.department}</span>}
              {selectedClient.director_name && <span>{selectedClient.director_name} 원장</span>}
              {selectedClient.is_specialist !== null && (
                <span>{selectedClient.is_specialist ? "전문의" : "전문의 아님"}</span>
              )}
              {selectedClient.region && <span className="w-full">{selectedClient.region}</span>}
            </div>

            <div className="flex gap-3 text-xs">
              <button className="text-gray-500 hover:text-gray-800" onClick={onOpenEditForm}>
                정보 수정
              </button>
              {isAdmin && (
                <button
                  className="text-red-500 hover:text-red-700 disabled:opacity-50"
                  disabled={deleting}
                  onClick={onDeleteClient}
                >
                  {deleting ? "삭제 중..." : "클라이언트 삭제"}
                </button>
              )}
            </div>
          </>
        )}

        <button
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          disabled={!canRun || isRunning}
          onClick={onRunMonitoring}
        >
          {isRunning ? "모니터링 실행 중..." : "▶ 모니터링 실행"}
        </button>
      </div>

      <nav className="flex-1 px-3 pt-2 pb-3 space-y-0.5">
        {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
          <button
            key={item.key}
            className={`w-full flex items-center gap-2.5 text-sm px-3 py-2 rounded-lg text-left transition-colors ${
              tab === item.key
                ? "text-blue-600 font-medium"
                : "text-gray-500 hover:bg-gray-50"
            }`}
            onClick={() => onTabChange(item.key)}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                tab === item.key ? "bg-blue-600" : "bg-gray-300"
              }`}
            />
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {username && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {username}
            {isAdmin && <span className="ml-1 text-gray-300">(관리자)</span>}
          </span>
          <button className="text-xs text-gray-400 hover:text-gray-700" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      )}
    </aside>
  );
}
