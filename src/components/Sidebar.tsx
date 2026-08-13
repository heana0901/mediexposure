"use client";

import type { Client } from "@/lib/types";
import { IconEye, IconBarChart, IconTrendingUp, IconCreditCard, IconUsers, IconGlobe } from "./icons";

export type Tab = "status" | "competitors" | "trends" | "siteaudit" | "usage" | "accounts";

type Props = {
  clients: Client[];
  selectedClientId: string | null;
  onSelectClient: (id: string) => void;
  onOpenCreateForm: () => void;
  onOpenEditForm: () => void;
  onRunMonitoring: () => void;
  isRunning: boolean;
  canRun: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  username: string | null;
  isAdmin: boolean;
  onLogout: () => void;
};

const NAV_ITEMS: { key: Tab; label: string; Icon: (props: { className?: string }) => React.ReactElement; adminOnly?: boolean }[] = [
  { key: "status", label: "AI노출현황", Icon: IconEye },
  { key: "competitors", label: "경쟁분석", Icon: IconBarChart },
  { key: "trends", label: "추이 분석", Icon: IconTrendingUp },
  { key: "siteaudit", label: "홈페이지 분석", Icon: IconGlobe },
  { key: "usage", label: "비용 현황", Icon: IconCreditCard, adminOnly: true },
  { key: "accounts", label: "계정 관리", Icon: IconUsers, adminOnly: true },
];

export function Sidebar({
  clients,
  selectedClientId,
  onSelectClient,
  onOpenCreateForm,
  onOpenEditForm,
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
    <aside className="w-72 shrink-0 bg-white border-r border-gray-100 flex flex-col h-full text-gray-600">
      <div className="px-5 pt-6 pb-5 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs tracking-tight shadow-lg shadow-blue-900/20 ring-1 ring-black/5">
            AI
          </div>
          <div className="font-semibold text-sm text-gray-900 tracking-tight">AI analytics</div>
        </div>
        <div className="mt-5 h-px bg-gradient-to-r from-blue-500/30 via-gray-200 to-transparent" />
      </div>

      <div className="px-4 pb-5 space-y-3">
        {isAdmin && (
          <button
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-100 shadow-sm bg-white text-gray-700 hover:bg-blue-50 hover:border-blue-100 hover:text-blue-700 active:scale-[0.98] transition-[transform,background-color,border-color,color]"
            onClick={onOpenCreateForm}
          >
            + 클라이언트 추가
          </button>
        )}

        <select
          className="w-full rounded-lg px-3 py-2 text-sm bg-white border border-gray-100 shadow-sm text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-colors"
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
              {selectedClient.director_name && (
                <span>
                  {selectedClient.client_type === "hospital"
                    ? `${selectedClient.director_name} 원장`
                    : `대표 ${selectedClient.director_name}`}
                </span>
              )}
              {selectedClient.client_type === "hospital" && selectedClient.is_specialist !== null && (
                <span>{selectedClient.is_specialist ? "전문의" : "전문의 아님"}</span>
              )}
              {selectedClient.region && <span className="w-full">{selectedClient.region}</span>}
            </div>

            <div className="flex gap-3 text-xs">
              <button className="text-gray-500 hover:text-blue-600 transition-colors" onClick={onOpenEditForm}>
                정보 수정
              </button>
            </div>
          </>
        )}

        <button
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-blue-900/20 hover:brightness-110 active:scale-[0.98] disabled:active:scale-100 transition-[transform,filter] disabled:opacity-40 disabled:shadow-none"
          disabled={!canRun || isRunning}
          onClick={onRunMonitoring}
        >
          {isRunning ? "모니터링 실행 중..." : "▶ 모니터링 실행"}
        </button>
      </div>

      <nav className="flex-1 px-3 pt-2 pb-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`w-full flex items-center gap-3 text-sm px-3 py-2.5 rounded-lg text-left transition-colors ${
              tab === key
                ? "bg-blue-600 text-white font-medium shadow-sm shadow-blue-600/20"
                : "text-gray-500 hover:bg-blue-50 hover:text-blue-700"
            }`}
            onClick={() => onTabChange(key)}
          >
            <span className={tab === key ? "text-white" : "text-gray-400"}>
              <Icon />
            </span>
            {label}
          </button>
        ))}
      </nav>

      {username && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {username}
            {isAdmin && <span className="ml-1 text-gray-400">(관리자)</span>}
          </span>
          <button className="text-xs text-gray-400 hover:text-gray-900 transition-colors" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      )}
    </aside>
  );
}
