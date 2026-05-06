"use client";

import { useState, useCallback } from "react";
import { updateMyCastProfile } from "@/actions/cast-profile";
import { useAutoSave } from "@/hooks/useAutoSave";
import { SaveStatus } from "@/components/common/SaveStatus";

type CastProfileEditorProps = {
  initialPublicProfile: string | null;
};

export function CastProfileEditor({ initialPublicProfile }: CastProfileEditorProps) {
  const [publicProfile, setPublicProfile] = useState(initialPublicProfile ?? "");

  const saveFn = useCallback(
    async (value: string) =>
      updateMyCastProfile({ publicProfile: value.trim() || null }),
    []
  );

  const { status, markAsChanged, saveNow } = useAutoSave(publicProfile, saveFn, {
    delay: 1500,
  });

  const remaining = 1000 - publicProfile.length;

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPublicProfile(event.target.value);
    markAsChanged();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveNow();
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
          onChange={handleChange}
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

      <div className="flex items-center justify-between">
        <SaveStatus status={status} />
        <button
          type="submit"
          disabled={status === "saving" || publicProfile.length > 1000}
          className="rounded-xl bg-terracotta px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "saving" ? "保存中..." : "今すぐ保存"}
        </button>
      </div>
    </form>
  );
}

export default CastProfileEditor;
