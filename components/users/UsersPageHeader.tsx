"use client";

import { useState } from "react";
import { CreateUserDialog } from "./CreateUserDialog";

export function UsersPageHeader() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-800">ユーザー</h1>
          <p className="mt-1 text-sm text-stone-500">
            ユーザーを検索・閲覧できます
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d0694e] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          ユーザーを追加
        </button>
      </div>

      <CreateUserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
