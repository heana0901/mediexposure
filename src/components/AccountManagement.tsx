"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppUser, Client } from "@/lib/types";

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
                    ) : u.clients.length === 0 ? (
                      <span className="text-xs text-gray-300">없음</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.clients.map((c) => (
                          <span
                            key={c.id}
                            className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5"
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
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
    </div>
  );
}
