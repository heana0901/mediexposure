"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppUser, Client } from "@/lib/types";
import { DEFAULT_INTERVAL_DAYS, INTERVAL_OPTIONS, intervalLabel } from "@/lib/schedule";
import { ALL_REPORT_SECTIONS, parseReportSections, REPORT_SECTIONS, type ReportSection } from "@/lib/reportSections";

type Props = {
  clients: Client[];
  currentUsername: string | null;
};

function NewUserForm({
  clients,
  onCreated,
  onClose,
}: {
  clients: Client[];
  onCreated: (user: AppUser) => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleClient(id: string) {
    setClientIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (!username.trim() || !password) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.createUser({
        username: username.trim(),
        password,
        isAdmin,
        clientIds,
      });
      onCreated({
        id: created.id,
        username: created.username,
        isAdmin: created.isAdmin,
        createdAt: new Date().toISOString(),
        clients: clients.filter((c) => clientIds.includes(c.id)),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">새 계정 추가</span>
        <button className="text-gray-400 hover:text-gray-600 text-sm" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          아이디
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          비밀번호
          <input
            type="password"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        전체 관리자 (모든 클라이언트 조회/관리 가능)
      </label>

      {!isAdmin && (
        <div>
          <div className="text-xs text-gray-500 mb-2">접근 허용할 클라이언트</div>
          <div className="flex flex-wrap gap-2">
            {clients.map((c) => (
              <label
                key={c.id}
                className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer ${
                  clientIds.includes(c.id)
                    ? "bg-blue-50 border-blue-300 text-blue-600"
                    : "bg-white border-gray-200 text-gray-600"
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={clientIds.includes(c.id)}
                  onChange={() => toggleClient(c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-500">{error}</div>}

      <button
        className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
        disabled={!username.trim() || !password || saving}
        onClick={handleSubmit}
      >
        {saving ? "추가 중..." : "추가"}
      </button>
    </div>
  );
}

function ClientAccessCell({
  user,
  clients,
  onSaved,
}: {
  user: AppUser;
  clients: Client[];
  onSaved: (clients: { id: string; name: string }[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [clientIds, setClientIds] = useState<string[]>(user.clients.map((c) => c.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleClient(id: string) {
    setClientIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateUserClients(user.id, clientIds);
      onSaved(clients.filter((c) => clientIds.includes(c.id)));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button className="text-left" onClick={() => setEditing(true)}>
        {user.clients.length === 0 ? (
          <span className="text-xs text-gray-300 hover:underline">없음 (클릭해서 추가)</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {user.clients.map((c) => (
              <span key={c.id} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 hover:bg-gray-200">
                {c.name}
              </span>
            ))}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {clients.map((c) => (
          <label
            key={c.id}
            className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${
              clientIds.includes(c.id)
                ? "bg-blue-50 border-blue-300 text-blue-600"
                : "bg-white border-gray-200 text-gray-600"
            }`}
          >
            <input
              type="checkbox"
              className="hidden"
              checked={clientIds.includes(c.id)}
              onChange={() => toggleClient(c.id)}
            />
            {c.name}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
          disabled={saving}
          onClick={handleSave}
        >
          저장
        </button>
        <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setEditing(false)}>
          취소
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}

function ClientAutomationRow({ client, onSaved }: { client: Client; onSaved: (client: Client) => void }) {
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const sections = parseReportSections(client.report_sections);

  async function run(kind: "save" | "send", task: () => Promise<string>) {
    setBusy(kind);
    setMessage(null);
    try {
      setMessage({ type: "ok", text: await task() });
      if (kind === "save") setTimeout(() => setMessage(null), 1500);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  function changeInterval(value: string) {
    const intervalDays = value === "" ? null : Number(value);
    void run("save", async () => {
      await api.updateMonitorInterval(client.id, intervalDays);
      onSaved({ ...client, monitor_interval_days: intervalDays });
      return "저장됨";
    });
  }

  function changeReport(enabled: boolean, next: ReportSection[]) {
    void run("save", async () => {
      await api.updateAutoReport(client.id, enabled, next);
      onSaved({ ...client, auto_report_enabled: enabled, report_sections: next });
      return "저장됨";
    });
  }

  function toggleSection(key: ReportSection) {
    const next = sections.includes(key) ? sections.filter((s) => s !== key) : [...sections, key];
    if (next.length === 0) {
      setMessage({ type: "error", text: "항목을 하나 이상 남겨 주세요" });
      return;
    }
    changeReport(client.auto_report_enabled, ALL_REPORT_SECTIONS.filter((s) => next.includes(s)));
  }

  function sendNow() {
    void run("send", async () => {
      const res = await api.sendReport(client.id);
      return res.attached ? `${res.sentTo}로 PDF 발송` : `${res.sentTo}로 발송 (PDF 없이 본문)`;
    });
  }

  return (
    <tr className="border-b border-gray-100 last:border-0 align-top">
      <td className="py-3 pr-3 text-gray-700 whitespace-nowrap">{client.name}</td>
      <td className="py-3 pr-3">
        <select
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 disabled:opacity-40"
          disabled={busy !== null}
          value={client.monitor_interval_days ?? ""}
          onChange={(e) => changeInterval(e.target.value)}
        >
          <option value="">기본 ({intervalLabel(DEFAULT_INTERVAL_DAYS)})</option>
          {INTERVAL_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {intervalLabel(days)}
              {days % 7 === 0 ? ` (${days}일)` : ""}
            </option>
          ))}
        </select>
      </td>
      <td className="py-3 pr-3">
        <div className="grid grid-cols-2 gap-1.5 w-max">
          {REPORT_SECTIONS.map((s) => {
            const on = sections.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                title={s.detail}
                disabled={busy !== null}
                onClick={() => toggleSection(s.key)}
                className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap disabled:opacity-50 ${
                  on ? "bg-blue-50 border-blue-300 text-blue-600" : "bg-white border-gray-200 text-gray-400"
                }`}
              >
                {on ? "✓ " : ""}
                {s.label}
              </button>
            );
          })}
        </div>
      </td>
      <td className="py-3 pr-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={client.auto_report_enabled}
            disabled={busy !== null}
            onChange={(e) => changeReport(e.target.checked, sections)}
          />
          체크 후 자동 발송
        </label>
        <div className="text-xs text-gray-400 mt-1 whitespace-nowrap">
          {client.contact_email ?? <span className="text-amber-600">수신 이메일 미등록</span>}
        </div>
      </td>
      <td className="py-3 text-right">
        <button
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
          disabled={busy !== null || !client.contact_email}
          title={client.contact_email ? "고른 항목으로 리포트 PDF를 지금 보냅니다" : "수신 이메일을 먼저 등록하세요"}
          onClick={sendNow}
        >
          {busy === "send" ? "보내는 중..." : "📧 지금 발송"}
        </button>
        {message && (
          <div className={`text-xs mt-1 ${message.type === "ok" ? "text-green-600" : "text-red-500"}`}>{message.text}</div>
        )}
      </td>
    </tr>
  );
}

function ClientAutomation({ clients }: { clients: Client[] }) {
  const [localClients, setLocalClients] = useState(clients);
  const [syncedClients, setSyncedClients] = useState(clients);

  if (clients !== syncedClients) {
    setSyncedClients(clients);
    setLocalClients(clients);
  }

  if (localClients.length === 0) return null;

  return (
    <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
      <div className="text-sm font-medium text-gray-700 mb-1">병원별 자동 체크 · 리포트</div>
      <div className="text-xs text-gray-400 mb-3 leading-relaxed">
        매일 낮 12시에 확인해서, 마지막 체크 후 주기가 지난 병원을 자동으로 체크합니다. &lsquo;체크 후 자동 발송&rsquo;을 켜면 체크가
        끝나자마자 고른 항목만 담은 리포트를 PDF로 첨부해 수신 이메일로 보냅니다. 주기가 짧을수록 비용이 늘어납니다.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b">
              <th className="py-2 pr-3 font-normal">클라이언트명</th>
              <th className="py-2 pr-3 font-normal">자동 체크 주기</th>
              <th className="py-2 pr-3 font-normal">리포트에 넣을 항목</th>
              <th className="py-2 pr-3 font-normal">발송</th>
              <th className="py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {localClients.map((c) => (
              <ClientAutomationRow
                key={c.id}
                client={c}
                onSaved={(updated) => setLocalClients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AccountManagement({ clients, currentUsername }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(user: AppUser) {
    const confirmed = window.confirm(`"${user.username}" 계정을 삭제하시겠습니까?`);
    if (!confirmed) return;
    setDeletingId(user.id);
    try {
      await api.deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">총 {users.length}개 계정</span>
        <button
          className="text-sm px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
          onClick={() => setShowForm((v) => !v)}
        >
          + 계정 추가
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {showForm && (
        <NewUserForm
          clients={clients}
          onCreated={(u) => setUsers((prev) => [...prev, u])}
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="border border-gray-100 rounded-xl bg-white shadow-sm p-4">
        {loading ? (
          <div className="text-sm text-gray-400 py-8 text-center">불러오는 중...</div>
        ) : users.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">등록된 계정이 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b">
                <th className="py-2 font-normal">아이디</th>
                <th className="py-2 font-normal">권한</th>
                <th className="py-2 font-normal">접근 가능 클라이언트</th>
                <th className="py-2 font-normal text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5 text-gray-700">
                    {u.username}
                    {u.username === currentUsername && (
                      <span className="ml-1.5 text-xs text-gray-400">(나)</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    {u.isAdmin ? (
                      <span className="text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-1">
                        관리자
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">일반</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    {u.isAdmin ? (
                      <span className="text-xs text-gray-400">전체</span>
                    ) : (
                      <ClientAccessCell
                        user={u}
                        clients={clients}
                        onSaved={(updatedClients) =>
                          setUsers((prev) =>
                            prev.map((p) => (p.id === u.id ? { ...p, clients: updatedClients } : p))
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    {u.username !== currentUsername && (
                      <button
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                        disabled={deletingId === u.id}
                        onClick={() => handleDelete(u)}
                      >
                        {deletingId === u.id ? "삭제 중..." : "삭제"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ClientAutomation clients={clients} />
    </div>
  );
}
