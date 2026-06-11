"use client";

import { useState, useEffect } from "react";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { CommandPalette } from "@/components/common/CommandPalette";
import { ShortcutHelp } from "@/components/common/ShortcutHelp";
import { RealtimeNotification } from "@/components/common/RealtimeNotification";
import { PushNotificationManager } from "@/components/common/PushNotificationManager";
import type { StaffRole } from "@/lib/supabase/types";

type AppShellProps = {
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  children: React.ReactNode;
};

export function AppShell({ staffId, staffName, staffRole, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration may fail outside secure contexts; push UI handles errors.
      });
    }
    // デスクトップサイドバーの折りたたみ状態を復元
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved === "true") setSidebarCollapsed(true);
  }, []);

  const handleToggleCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

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
        isCollapsed={sidebarCollapsed}
        onToggleCollapsed={handleToggleCollapsed}
      />

      {/* メインコンテンツエリア */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"}`}>
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
      <CommandPalette role={staffRole} />
      <ShortcutHelp />
      <RealtimeNotification />
      <PushNotificationManager />
    </div>
  );
}
