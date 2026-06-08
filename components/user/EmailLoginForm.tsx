"use client";

import { useState, useTransition } from "react";
import { requestEmailLogin } from "@/actions/account-auth";

function MailIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}

export function EmailLoginForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    startTransition(async () => {
      await requestEmailLogin(email.trim());
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h2 className="text-base font-bold text-emerald-900">メールを送信しました</h2>
        <p className="mt-2 text-sm leading-relaxed text-emerald-800">
          ご登録のメールアドレス宛にログインリンクをお送りしました。
          メール内のリンクから30分以内にログインしてください。
        </p>
        <p className="mt-3 text-xs text-emerald-700">
          メールが届かない場合は、迷惑メールフォルダもご確認ください。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <label htmlFor="email" className="block text-sm font-bold text-stone-800">
        メールアドレス
      </label>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">
        ご契約時に登録されたメールアドレスを入力してください。
      </p>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="mt-3 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <button
        type="submit"
        disabled={isPending || !email.trim()}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        <MailIcon />
        {isPending ? "送信中..." : "ログインリンクを送る"}
      </button>
    </form>
  );
}
