"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getCastOptions, assignCast, type CastOption } from "@/actions/assignments";
import { Select } from "@/components/common/Select";
import { useToast } from "@/components/common/Toast";

type BulkAssignModalProps = {
  targets: { id: string; displayName: string }[];
  onClose: (didUpdate: boolean) => void;
};

/**
 * 選択中ユーザーの担当メイトを一括変更（Admin/Supervisor）。
 * 既存の assignCast を1人ずつ順番に呼ぶため、キャパシティ検証・監査ログ・
 * LINE通知（担当変更のお知らせ）がそのまま全員に適用される。
 */
export function BulkAssignModal({ targets, onClose }: BulkAssignModalProps) {
  const { showToast, ToastContainer } = useToast();
  const [casts, setCasts] = useState<CastOption[]>([]);
  const [loadingCasts, setLoadingCasts] = useState(true);
  const [toCastId, setToCastId] = useState("");
  const [reason, setReason] = useState("");
  const [progress, setProgress] = useState<{ done: number; failedNames: string[] } | null>(null);

  useEffect(() => {
    void getCastOptions().then((result) => {
      setCasts(result.ok ? result.data.casts : []);
      setLoadingCasts(false);
      if (!result.ok) showToast(result.error.message, "error");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = progress !== null && progress.done < targets.length;

  const handleSubmit = async () => {
    if (!toCastId || !reason.trim()) return;
    setProgress({ done: 0, failedNames: [] });

    // キャパシティ判定が1人ずつ変化するため直列で実行する
    const failedNames: string[] = [];
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      const result = await assignCast({
        endUserId: target.id,
        toCastId,
        reason: reason.trim(),
      });
      if (!result.ok) failedNames.push(target.displayName);
      setProgress({ done: i + 1, failedNames: [...failedNames] });
    }

    if (failedNames.length === 0) {
      showToast(`${targets.length}人の担当を変更しました`, "success");
      onClose(true);
    } else {
      showToast(
        `${targets.length - failedNames.length}人変更・${failedNames.length}人失敗（${failedNames
          .slice(0, 3)
          .join("、")}${failedNames.length > 3 ? " ほか" : ""}）`,
        "error"
      );
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
        onClick={() => {
          if (!running) onClose(progress !== null);
        }}
      />

      <div className="relative z-10 w-full rounded-t-2xl bg-white p-5 shadow-soft-lg sm:max-w-md sm:rounded-2xl">
        <h2 className="text-base font-bold text-stone-800">{targets.length}人の担当を変更</h2>
        <p className="mt-0.5 text-xs text-stone-500">
          変更後、各ユーザーへ担当変更のお知らせがLINEで送られます。
        </p>

        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm font-bold text-stone-700">
              新しい担当 <span className="text-terracotta">*</span>
            </label>
            {loadingCasts ? (
              <div className="mt-1.5 h-10 animate-pulse rounded-xl bg-stone-200" />
            ) : (
              <div className="mt-1.5">
                <Select
                  aria-label="新しい担当メイト"
                  value={toCastId}
                  onChange={setToCastId}
                  placeholder="メイトを選択..."
                  options={[
                    { value: "", label: "メイトを選択...", disabled: true },
                    ...casts.map((cast) => {
                      const isAtCapacity =
                        cast.capacityLimit !== null &&
                        cast.assignedUserCount + targets.length > cast.capacityLimit;
                      return {
                        value: cast.id,
                        disabled: !cast.acceptingNewUsers || isAtCapacity,
                        label: `${cast.displayName} (${cast.assignedUserCount}${
                          cast.capacityLimit ? `/${cast.capacityLimit}` : ""
                        }人)${!cast.acceptingNewUsers ? " [受付停止中]" : ""}${
                          isAtCapacity ? " [枠不足]" : ""
                        }`,
                      };
                    }),
                  ]}
                />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="bulk-assign-reason" className="block text-sm font-bold text-stone-700">
              変更理由 <span className="text-terracotta">*</span>
            </label>
            <textarea
              id="bulk-assign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder="例: 担当メイトの退職に伴う引き継ぎ"
              className="mt-1.5 block w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 shadow-sm transition-all focus:border-terracotta focus:bg-white focus:outline-none focus:ring-1 focus:ring-terracotta"
            />
          </div>

          {progress && (
            <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-sm text-stone-600">
              変更中… {progress.done}/{targets.length}
              {progress.failedNames.length > 0 && (
                <span className="text-red-600">（失敗 {progress.failedNames.length}）</span>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={() => onClose(progress !== null)}
            disabled={running}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:opacity-50"
          >
            {progress && !running ? "閉じる" : "キャンセル"}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!toCastId || !reason.trim() || progress !== null}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-terracotta px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "変更中…" : "担当を変更"}
          </button>
        </div>
      </div>
      <ToastContainer />
    </div>
  );

  return createPortal(modal, document.body);
}
