"use client";

import { useState } from "react";
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
  const [blocking, setBlocking] = useState(false);

  const handleToggleBlock = async () => {
    setBlocking(true);
    try {
      const result = await setEndUserBlocked({
        endUserId: user.id,
        blocked: !user.isBlocked,
      });
      if (result.ok) {
        showToast(
          user.isBlocked ? "ブロックを解除しました" : "ユーザーをブロックしました",
          "success"
        );
        setBlockConfirmOpen(false);
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("操作に失敗しました", "error");
    } finally {
      setBlocking(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canManage && (
          <>
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
            <button
              onClick={() => setBlockConfirmOpen(true)}
              className={
                user.isBlocked
                  ? "rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-600 shadow-sm hover:bg-stone-50 hover:text-stone-800 transition-colors"
                  : "rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 shadow-sm hover:bg-red-50 transition-colors"
              }
            >
              {user.isBlocked ? "ブロック解除" : "ブロック"}
            </button>
          </>
        )}
        <Link
          href={`/inbox?user=${user.id}`}
          className="rounded-xl bg-terracotta px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] hover:shadow-md transition-all"
        >
          チャットを開く
        </Link>
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

      <ConfirmDialog
        open={blockConfirmOpen}
        title={user.isBlocked ? "ブロックを解除しますか？" : "このユーザーをブロックしますか？"}
        description={
          user.isBlocked
            ? `${user.nickname}さんのブロックを解除します。以降のメッセージは通常どおり受信・表示されます。`
            : `${user.nickname}さんをブロックします。以降この相手からのLINEは保存・通知・案内をすべて停止し、管理画面にも表示されません。`
        }
        confirmLabel={user.isBlocked ? "ブロック解除" : "ブロックする"}
        variant={user.isBlocked ? "default" : "danger"}
        onConfirm={handleToggleBlock}
        onCancel={() => setBlockConfirmOpen(false)}
        loading={blocking}
      />

      <ToastContainer />
    </>
  );
}
