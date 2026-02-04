"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StaffRole } from "@/lib/supabase/types";

type TopBarProps = {
  staffName: string;
  staffRole: StaffRole;
  onMenuClick: () => void;
};

const roleLabels: Record<StaffRole, string> = {
  admin: "管理者",
  supervisor: "SV",
  cast: "キャスト",
};

const roleColors: Record<StaffRole, string> = {
  admin: "bg-stone-800 text-stone-50",
  supervisor: "bg-sage text-white",
  cast: "bg-terracotta text-white",
};

export function TopBar({ staffName, staffRole, onMenuClick }: TopBarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* モバイル用メニューボタン */}
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 lg:hidden"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* 左側スペーサー（デスクトップ） */}
        <div className="hidden lg:block" />

        {/* 右側：ユーザー情報 */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${roleColors[staffRole]}`}>
              {roleLabels[staffRole]}
            </span>
            <span className="text-sm font-medium text-stone-700">{staffName}</span>
          </div>
          <div className="h-4 w-px bg-stone-200" />
          <button
            onClick={handleLogout}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors"
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}
