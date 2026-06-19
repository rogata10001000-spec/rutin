"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getTodayProgress } from "@/actions/progress";

type BottomNavItem = {
  name: string;
  href: string;
  icon: React.ReactNode;
  /** 受信トレイのみ未対応バッジを表示 */
  showBadge?: boolean;
};

const InboxIcon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
  </svg>
);

const UsersIcon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const ProfileIcon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const items: BottomNavItem[] = [
  { name: "受信トレイ", href: "/inbox", icon: <InboxIcon />, showBadge: true },
  { name: "ユーザー", href: "/users", icon: <UsersIcon /> },
  { name: "プロフィール", href: "/my-photos", icon: <ProfileIcon /> },
];

/**
 * メイト(cast)専用のモバイル用ボトムタブナビ。
 * - lg未満でのみ表示（デスクトップはサイドバーを使用）
 * - 受信トレイで会話を開いている間は隠し、入力欄(composer)を優先する
 * - 受信トレイに「今日の未対応数」バッジを表示
 */
export function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [remaining, setRemaining] = useState(0);
  const [, startTransition] = useTransition();

  // 未対応数（今日担当ユーザーのうち未対応の人数）を取得・定期更新
  useEffect(() => {
    const load = () =>
      startTransition(async () => {
        const result = await getTodayProgress();
        if (result.ok) {
          setRemaining(Math.max(0, result.data.total - result.data.replied));
        }
      });
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [pathname]);

  // 受信トレイで会話を開いている間（?user=...）はナビを隠す
  const inConversation = pathname.startsWith("/inbox") && searchParams.has("user");
  if (inConversation) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-safe backdrop-blur-md lg:hidden"
      aria-label="メイン"
    >
      <ul className="flex h-16 items-stretch">
        {items.map((item) => {
          const isActive =
            item.href === "/inbox"
              ? pathname === "/inbox"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const badge = item.showBadge && remaining > 0;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  isActive ? "text-terracotta" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                <span className="relative">
                  {item.icon}
                  {badge && (
                    <span className="absolute -right-2.5 -top-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold text-white shadow-sm">
                      {remaining > 99 ? "99+" : remaining}
                    </span>
                  )}
                </span>
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
