"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
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
  const pathname = usePathname();

  const isCast = staffRole === "cast";
  // 受信トレイ/チャットは自前で全画面高さを管理するため、main 側の下余白は付けない。
  // それ以外のメイト向けページはボトムナビ分の下余白を確保する。
  const fullHeightRoute = pathname.startsWith("/inbox") || pathname.startsWith("/chat");

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

  // 受信トレイ/チャットは画面いっぱいの固定枠で、中身（一覧・会話）だけを
  // スクロールさせたい。body が動くと枠ごと上下にズレるため、これらのページと
  // ドロワー表示中は body のスクロールを止める。
  useEffect(() => {
    if (!sidebarOpen && !fullHeightRoute) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen, fullHeightRoute]);

  const handleToggleCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  return (
    <div
      className={`bg-stone-50 pattern-grid-lg ${
        fullHeightRoute ? "h-[100dvh] overflow-hidden" : "min-h-screen"
      }`}
    >
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

        <main className={isCast && !fullHeightRoute ? "pt-8 pb-bottomnav lg:pb-8" : "py-8"}>
          <div className="container-responsive">
            {children}
          </div>
        </main>
      </div>

      {/* メイト専用: モバイル用ボトムタブナビ */}
      {isCast && <BottomNav />}

      {/* グローバルキーボードショートカット */}
      <CommandPalette role={staffRole} />
      <ShortcutHelp />
      <RealtimeNotification />
      <PushNotificationManager />
    </div>
  );
}
