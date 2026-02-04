"use client";

import { useState } from "react";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { CommandPalette } from "@/components/common/CommandPalette";
import { ShortcutHelp } from "@/components/common/ShortcutHelp";
import type { StaffRole } from "@/lib/supabase/types";

type AppShellProps = {
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  children: React.ReactNode;
};

export function AppShell({ staffId, staffName, staffRole, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-stone-50 pattern-grid-lg">
      {/* モバイル用サイドバーオーバーレイ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* サイドナビゲーション */}
      <SideNav
        role={staffRole}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* メインコンテンツエリア */}
      <div className="lg:pl-64 transition-all duration-300">
        <TopBar
          staffName={staffName}
          staffRole={staffRole}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className="py-8">
          <div className="container-responsive">
            {children}
          </div>
        </main>
      </div>

      {/* グローバルキーボードショートカット */}
      <CommandPalette />
      <ShortcutHelp />
    </div>
  );
}
