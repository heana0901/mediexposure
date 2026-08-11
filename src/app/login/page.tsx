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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-gray-100 rounded-2xl bg-white shadow-xl shadow-gray-200/60 p-8 space-y-5"
      >
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-blue-900/20 ring-1 ring-black/5">
              M
            </div>
            <div className="font-semibold text-base text-gray-900 tracking-tight">Medi-Exposure</div>
          </div>
          <div className="mt-4 h-px bg-gradient-to-r from-blue-500/30 via-gray-200 to-transparent" />
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-500">
          아이디
          <input
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-gray-500">
          비밀번호
          <input
            type="password"
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
        )}

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-blue-900/20 hover:brightness-110 active:scale-[0.98] disabled:active:scale-100 transition-[transform,filter] disabled:opacity-50 disabled:shadow-none"
          disabled={loading || !username || !password}
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
