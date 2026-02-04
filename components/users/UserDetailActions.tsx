"use client";

import { useState } from "react";
import Link from "next/link";
import type { UserDetail } from "@/actions/users";
import { EditUserDialog } from "./EditUserDialog";
import { AssignCastDialog } from "./AssignCastDialog";

type UserDetailActionsProps = {
  user: UserDetail;
};

export function UserDetailActions({ user }: UserDetailActionsProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-2">
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
        <Link
          href={`/chat/${user.id}`}
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
    </>
  );
}
