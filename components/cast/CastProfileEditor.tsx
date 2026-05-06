"use client";

import { useState, useTransition } from "react";
import { updateMyCastProfile } from "@/actions/cast-profile";

type CastProfileEditorProps = {
  initialPublicProfile: string | null;
};

export function CastProfileEditor({ initialPublicProfile }: CastProfileEditorProps) {
  const [publicProfile, setPublicProfile] = useState(initialPublicProfile ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const remaining = 1000 - publicProfile.length;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await updateMyCastProfile({
        publicProfile: publicProfile.trim() || null,
      });

      if (result.ok) {
        setPublicProfile(result.data.publicProfile ?? "");
        setMessage("プロフィール文を保存しました");
        return;
      }

      setError(result.error.message);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="publicProfile" className="block text-sm font-bold text-stone-700">
          ユーザー向けプロフィール
        </label>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">
          伴走メイト選択画面の詳細モーダルに表示されます。自己紹介や得意な相談内容を書いてください。
        </p>
        <textarea
          id="publicProfile"
          value={publicProfile}
          onChange={(event) => setPublicProfile(event.target.value)}
          maxLength={1000}
          rows={6}
          className="mt-3 block w-full rounded-xl border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 shadow-sm focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
          placeholder="例: 恋愛や自分磨きの相談を中心に、気持ちを整理しながら一緒に前に進めるよう伴走します。"
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={remaining < 0 ? "text-red-600" : "text-stone-400"}>
            残り {remaining} 文字
          </span>
          <span className="text-stone-400">最大1000文字</span>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || publicProfile.length > 1000}
          className="rounded-xl bg-terracotta px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "保存中..." : "プロフィール文を保存"}
        </button>
      </div>
    </form>
  );
}

export default CastProfileEditor;
