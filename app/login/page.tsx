"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError("メールアドレスまたはパスワードが正しくありません");
        return;
      }

      router.push("/inbox");
      router.refresh();
    } catch {
      setError("ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 pattern-grid-lg text-stone-800">
      <div className="w-full max-w-md">
        <div className="relative overflow-hidden rounded-2xl bg-white p-10 shadow-soft-lg ring-1 ring-stone-900/5">
          {/* Decorative top accent */}
          <div className="absolute top-0 left-0 h-1.5 w-full bg-terracotta" />

          <div className="mb-10 text-center">
            <h1 className="font-sans text-3xl font-bold tracking-tight text-stone-800">
              Rutin
            </h1>
            <p className="mt-3 text-sm font-medium text-stone-500">
              伴走型・習慣化サポート管理画面
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-stone-700"
              >
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 placeholder-stone-400 shadow-sm transition-all focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta sm:text-sm"
                placeholder="staff@rutin.jp"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-stone-700"
              >
                パスワード
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-3 pr-20 text-stone-900 placeholder-stone-400 shadow-sm transition-all focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta sm:text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-200 hover:text-stone-700 transition-colors"
                  aria-pressed={showPassword}
                >
                  {showPassword ? "隠す" : "表示"}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 p-4 border border-red-100">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full transform rounded-xl bg-terracotta px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none"
            >
              {loading ? "ログイン中..." : "ログインして始める"}
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-xs text-stone-400">
              &copy; Rutin System. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
