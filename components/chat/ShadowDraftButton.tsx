"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  getShadowDrafts,
  createShadowDraft,
  checkShadowAccess,
  type ShadowDraft,
} from "@/actions/assignments";
import { useToast } from "@/components/common/Toast";

type ShadowDraftButtonProps = {
  endUserId: string;
  currentBody: string;
  onClearBody: () => void;
};

export function ShadowDraftButton({
  endUserId,
  currentBody,
  onClearBody,
}: ShadowDraftButtonProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [isShadow, setIsShadow] = useState(false);
  const [shadowUntil, setShadowUntil] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ShadowDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);

  useEffect(() => {
    checkAccess();
  }, [endUserId]);

  const checkAccess = async () => {
    const accessResult = await checkShadowAccess(endUserId);
    if (accessResult.ok) {
      setIsShadow(accessResult.data.isShadow);
      setShadowUntil(accessResult.data.shadowUntil);

      if (accessResult.data.isShadow) {
        const draftsResult = await getShadowDrafts(endUserId);
        if (draftsResult.ok) {
          setDrafts(draftsResult.data.drafts);
        }
      }
    }
    setLoading(false);
  };

  const handleSaveDraft = async () => {
    if (!currentBody.trim()) {
      showToast("下書き内容を入力してください", "error");
      return;
    }

    setSubmitting(true);
    const result = await createShadowDraft({
      endUserId,
      body: currentBody,
    });

    if (result.ok) {
      showToast("下書きを保存しました", "success");
      onClearBody();
      await checkAccess(); // Reload drafts
      router.refresh();
    } else {
      showToast(result.error.message, "error");
    }
    setSubmitting(false);
  };

  // Shadow期間でなければ何も表示しない
  if (loading || !isShadow) {
    return null;
  }

  return (
    <>
      <div className="mb-3 rounded-xl border border-yellow-200 bg-yellow-50/80 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">👁️</span>
            <div>
              <p className="font-bold text-yellow-800">Shadow期間中</p>
              <p className="text-xs font-medium text-yellow-600">
                {shadowUntil
                  ? `${format(new Date(shadowUntil), "yyyy/MM/dd")}まで`
                  : "期限未設定"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDrafts(!showDrafts)}
              className="rounded-lg border border-yellow-300 bg-white px-3 py-1.5 text-sm font-bold text-yellow-700 hover:bg-yellow-50 transition-colors"
            >
              下書き一覧 ({drafts.length})
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={submitting || !currentBody.trim()}
              className="rounded-lg bg-yellow-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {submitting ? "保存中..." : "下書き保存"}
            </button>
          </div>
        </div>

        <p className="text-xs font-medium text-yellow-700">
          Shadow期間中は直接送信できません。下書きを保存して担当キャストに確認してもらいましょう。
        </p>

        {/* 下書き一覧 */}
        {showDrafts && (
          <div className="mt-4 border-t border-yellow-200 pt-3">
            <p className="mb-2 text-sm font-bold text-yellow-800">保存された下書き</p>
            {drafts.length > 0 ? (
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="rounded-lg border border-yellow-200 bg-white p-3 shadow-sm"
                  >
                    <p className="line-clamp-2 text-sm text-stone-700 leading-relaxed">
                      {draft.body}
                    </p>
                    <p className="mt-1.5 text-xs text-stone-400">
                      {draft.createdByName} ・{" "}
                      {format(new Date(draft.createdAt), "M/d HH:mm", { locale: ja })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-yellow-600">まだ下書きがありません</p>
            )}
          </div>
        )}
      </div>

      <ToastContainer />
    </>
  );
}
