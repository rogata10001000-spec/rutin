"use client";

import { useState, useOptimistic, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserDetail } from "@/actions/users";
import { setEndUserBlocked } from "@/actions/users";
import { EditUserDialog } from "./EditUserDialog";
import { AssignCastDialog } from "./AssignCastDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";

type UserDetailActionsProps = {
  user: UserDetail;
  canManage: boolean;
};

export function UserDetailActions({ user, canManage }: UserDetailActionsProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // ブロック状態は即座に見た目を反映する（サーバー応答を待たない）
  const [isBlocked, setOptimisticBlocked] = useOptimistic(
    user.isBlocked,
    (_state, next: boolean) => next
  );

  const handleToggleBlock = () => {
    if (isPending) return;
    const next = !isBlocked;
    // 確認は済んだので待たずに閉じる（開いたままだと楽観表示が見えない）
    setBlockConfirmOpen(false);

    startTransition(async () => {
      setOptimisticBlocked(next);
      try {
        const result = await setEndUserBlocked({
          endUserId: user.id,
          blocked: next,
        });
        if (result.ok) {
          showToast(
            next ? "ユーザーをブロックしました" : "ブロックを解除しました",
            "success"
          );
          // setEndUserBlocked は revalidatePath を呼ばないため、
          // ここで再取得しないと楽観表示がトランジション終了時に元へ戻る
          router.refresh();
        } else {
          showToast(
            result.error.code === "FORBIDDEN" || result.error.code === "UNAUTHORIZED"
              ? `${result.error.message}。権限のある管理者に操作を依頼してください`
              : `${result.error.message}。表示は元に戻しました。時間をおいてもう一度お試しください`,
            "error"
          );
        }
      } catch {
        showToast(
          "通信に失敗し、ブロック状態を変更できませんでした。通信状況を確認してもう一度お試しください",
          "error"
        );
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* 主アクション: 最頻の「チャットを開く」を塗りボタンで一番目立たせる */}
        <Link
          href={`/inbox?user=${user.id}`}
          className="rounded-xl bg-terracotta px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] hover:shadow-md transition-all"
        >
          チャットを開く
        </Link>
        {canManage && (
          <>
            {/* 副アクション: 控えめな枠線ボタン */}
            <button
              onClick={() => setEditDialogOpen(true)}
              className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-600 shadow-sm hover:bg-stone-50 hover:text-stone-800 transition-colors"
            >
              編集
            </button>
            <button
              onClick={() => setAssignDialogOpen(true)}
              className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-600 shadow-sm hover:bg-stone-50 hover:text-stone-800 transition-colors"
            >
              担当変更
            </button>
            {/* 区切り: 危険操作を視覚的に分離する */}
            <span className="mx-1 hidden h-6 w-px self-center bg-stone-200 sm:block" aria-hidden />
            {/* 危険操作: ブロック（解除は復元操作なので控えめな中立色） */}
            <button
              onClick={() => setBlockConfirmOpen(true)}
              disabled={isPending}
              aria-busy={isPending}
              className={
                isBlocked
                  ? "rounded-xl px-3 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100 hover:text-stone-700 transition-colors disabled:opacity-50"
                  : "rounded-xl px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              }
            >
              {isBlocked ? "ブロック解除" : "ブロック"}
            </button>
          </>
        )}
      </div>

      <EditUserDialog
        open={editDialogOpen}
        user={user}
        onClose={() => setEditDialogOpen(false)}
      />

      <AssignCastDialog
        open={assignDialogOpen}
        user={user}
        onClose={() => setAssignDialogOpen(false)}
      />

      {/* 確認したら即座に閉じて楽観表示に切り替えるため、loading は渡さない
          （閉じたダイアログの loading は表示されず、状態が食い違う） */}
      <ConfirmDialog
        open={blockConfirmOpen}
        title={isBlocked ? "ブロックを解除しますか？" : "このユーザーをブロックしますか？"}
        description={
          isBlocked
            ? `${user.nickname}さんのブロックを解除します。以降のメッセージは通常どおり受信・表示されます。`
            : `${user.nickname}さんをブロックします。以降この相手からのLINEは保存・通知・案内をすべて停止し、管理画面にも表示されません。`
        }
        confirmLabel={isBlocked ? "ブロック解除" : "ブロックする"}
        variant={isBlocked ? "default" : "danger"}
        onConfirm={handleToggleBlock}
        onCancel={() => setBlockConfirmOpen(false)}
      />

      <ToastContainer />
    </>
  );
}
