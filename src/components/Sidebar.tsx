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

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconBarChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconTrendingUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function IconCreditCard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="1" y="4" width="22" height="16" rx="2.5" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

const NAV_ITEMS: { key: Tab; label: string; Icon: () => React.ReactElement; adminOnly?: boolean }[] = [
  { key: "status", label: "AI노출현황", Icon: IconEye },
  { key: "competitors", label: "경쟁병원분석", Icon: IconBarChart },
  { key: "trends", label: "추이 분석", Icon: IconTrendingUp },
  { key: "usage", label: "비용 현황", Icon: IconCreditCard, adminOnly: true },
  { key: "accounts", label: "계정 관리", Icon: IconUsers, adminOnly: true },
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
    <aside className="w-72 shrink-0 bg-[#111827] flex flex-col h-full text-slate-200">
      <div className="px-5 pt-6 pb-5 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-lg shadow-blue-900/40 ring-1 ring-white/10">
            M
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight text-white tracking-tight">MediExposure</div>
            <div className="text-[11px] text-slate-400 leading-tight">Marketing Dashboard</div>
          </div>
        </div>
        <div className="mt-5 h-px bg-gradient-to-r from-blue-500/40 via-slate-700/60 to-transparent" />
      </div>

      <div className="px-4 pb-5 space-y-3">
        {isAdmin && (
          <button
            className="w-full text-sm px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800 transition-colors"
            onClick={onOpenCreateForm}
          >
            + 클라이언트 추가
          </button>
        )}

        <select
          className="w-full rounded-lg px-3 py-2 text-sm bg-slate-800 border border-slate-700 text-slate-100 [color-scheme:dark]"
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
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
              {selectedClient.department && <span>{selectedClient.department}</span>}
              {selectedClient.director_name && <span>{selectedClient.director_name} 원장</span>}
              {selectedClient.is_specialist !== null && (
                <span>{selectedClient.is_specialist ? "전문의" : "전문의 아님"}</span>
              )}
              {selectedClient.region && <span className="w-full">{selectedClient.region}</span>}
            </div>

            <div className="flex gap-3 text-xs">
              <button className="text-slate-400 hover:text-slate-100" onClick={onOpenEditForm}>
                정보 수정
              </button>
              {isAdmin && (
                <button
                  className="text-red-400 hover:text-red-300 disabled:opacity-50"
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
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-blue-900/30 hover:brightness-110 transition disabled:opacity-40 disabled:shadow-none"
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
                ? "bg-blue-600/15 text-white font-medium ring-1 ring-inset ring-blue-500/30"
                : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
            }`}
            onClick={() => onTabChange(key)}
          >
            <span className={tab === key ? "text-blue-400" : "text-slate-500"}>
              <Icon />
            </span>
            {label}
          </button>
        ))}
      </nav>

      {username && (
        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {username}
            {isAdmin && <span className="ml-1 text-slate-500">(관리자)</span>}
          </span>
          <button className="text-xs text-slate-500 hover:text-slate-200" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      )}
    </aside>
  );
}
