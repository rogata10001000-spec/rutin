"use client";

import { useState } from "react";
import {
  updateCastStyle,
  suggestCastStyle,
  type CastStyleView,
} from "@/actions/cast-style";
import { useToast } from "@/components/common/Toast";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

const MAX_LENGTH = 600;

/** 学習に使える送信履歴の最低件数（lib/ai-style.ts の STYLE_MIN_SAMPLES と揃える） */
const MIN_SAMPLES = 10;

function formatJaDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type StyleEditorProps = {
  initial: CastStyleView;
};

/**
 * AI下書きの口調を決める「返信スタイル」の編集。
 *
 * 自動生成は「提案 → 本人が確認して保存」の2段階にしている。
 * 生成結果をそのまま保存すると、本人が意図しない口調のまま
 * 全ユーザーへの下書きに反映されてしまうため。
 */
export function StyleEditor({ initial }: StyleEditorProps) {
  const { showToast, ToastContainer } = useToast();
  const [value, setValue] = useState(initial.styleSummary ?? "");
  const [savedValue, setSavedValue] = useState(initial.styleSummary ?? "");
  const [updatedAt, setUpdatedAt] = useState(initial.styleUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);

  const isDirty = value !== savedValue;
  const canSuggest = initial.sampleCount >= MIN_SAMPLES;
  const updatedLabel = formatJaDateTime(updatedAt);

  const handleSave = async () => {
    setSaving(true);
    const result = await updateCastStyle({ castId: initial.castId, styleSummary: value });
    setSaving(false);

    if (result.ok) {
      setSavedValue(value);
      setUpdatedAt(value.trim() ? result.data.styleUpdatedAt : null);
      showToast(
        value.trim()
          ? "スタイルを保存しました。次のAI下書きから反映されます"
          : "スタイルを未設定に戻しました",
        "success"
      );
    } else {
      showToast(result.error.message, "error");
    }
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    const result = await suggestCastStyle(initial.castId);
    setSuggesting(false);

    if (result.ok) {
      // 既に入力がある場合は上書き確認を挟む（書いた内容を黙って消さない）
      if (value.trim()) {
        setPendingSuggestion(result.data.summary);
      } else {
        setValue(result.data.summary);
        showToast(
          `直近${result.data.sampleCount}件の返信から作成しました。内容を確認して保存してください`,
          "success"
        );
      }
    } else {
      showToast(result.error.message, "error");
    }
  };

  return (
    <div className="space-y-4">
      <ToastContainer />

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-stone-800">返信スタイル</h2>
            <p className="mt-1 text-sm leading-relaxed text-stone-500">
              あなたの口調の特徴を書いておくと、AI下書きがあなたらしい文章で作られます。
              普段の返信から自動で作ることもできます。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSuggest()}
            disabled={suggesting || !canSuggest}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggesting ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[18px]">
                  progress_activity
                </span>
                作成中…
              </>
            ) : (
              "普段の返信から作る"
            )}
          </button>
        </div>

        {!canSuggest && (
          <p className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-500">
            自動作成には返信の履歴が{MIN_SAMPLES}件以上必要です（現在
            {initial.sampleCount}件）。それまでは自由に書いていただけます。
          </p>
        )}

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MAX_LENGTH}
          rows={7}
          placeholder="例: 丁寧語をベースに、語尾をやわらかくする。絵文字は😊を1通に1つ程度。相手の名前で呼びかけ、まず気持ちに共感してから提案する。1通は3〜4行程度。"
          className="mt-3 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-stone-800 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
        />

        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-stone-400">
            {updatedLabel ? `最終更新: ${updatedLabel}` : "未設定（一般的な口調で生成されます）"}
          </p>
          <p className="text-xs text-stone-400">
            {value.length} / {MAX_LENGTH}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={() => setValue(savedValue)}
              disabled={saving}
              className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-bold text-stone-500 transition-colors hover:bg-stone-100 disabled:opacity-50"
            >
              変更を破棄
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !isDirty}
            className="inline-flex h-11 items-center rounded-xl bg-terracotta px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存する"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingSuggestion !== null}
        title="いまの内容を置き換えますか？"
        description="普段の返信から作ったスタイル案で、入力中の内容を置き換えます。置き換えた後も保存前なら「変更を破棄」で戻せます。"
        confirmLabel="置き換える"
        cancelLabel="やめる"
        onConfirm={() => {
          if (pendingSuggestion) setValue(pendingSuggestion);
          setPendingSuggestion(null);
          showToast("スタイル案を反映しました。内容を確認して保存してください", "success");
        }}
        onCancel={() => setPendingSuggestion(null)}
      />
    </div>
  );
}
