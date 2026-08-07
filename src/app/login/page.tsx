"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "로그인에 실패했습니다.");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm border rounded-xl bg-white p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
            M
          </div>
          <div className="font-semibold text-sm">Medi-Exposure</div>
        </div>

        <label className="flex flex-col gap-1 text-xs text-gray-500">
          아이디
          <input
            className="border rounded-lg px-3 py-2 text-sm text-gray-900"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-500">
          비밀번호
          <input
            type="password"
            className="border rounded-lg px-3 py-2 text-sm text-gray-900"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

        <button
          type="submit"
          className="w-full bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          disabled={loading || !username || !password}
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
