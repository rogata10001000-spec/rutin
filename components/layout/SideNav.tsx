"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/lib/supabase/types";

type SideNavProps = {
  role: StaffRole;
  isOpen: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
};

type NavItem = {
  name: string;
  href: string;
  icon: React.ReactNode;
  roles: StaffRole[];
};

const DashboardIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h5a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6zM4 16a1 1 0 011-1h5a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3z" />
  </svg>
);

const InboxIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
  </svg>
);

const UsersIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const StaffIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const PricingIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SettlementIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const AuditIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const WebhookIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

const LineAccountIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z" />
  </svg>
);

const TaxIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
  </svg>
);

const PlanIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const PhotoIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const CancellationIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const RevenueIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
  </svg>
);

const MarketingIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
  </svg>
);

// 配分ルール（分配）— 共有/分岐アイコン
const SplitIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
);

// ファネル分析 — じょうご(フィルター)アイコン
const FunnelIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.879a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

// ステップ配信 — 紙ヒコーキ(送信)アイコン
const StepIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

type NavGroup = {
  /** セクション見出し（null の場合は見出しなしの主要グループ） */
  label: string | null;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { name: "ダッシュボード", href: "/admin", icon: <DashboardIcon />, roles: ["admin", "supervisor"] },
      { name: "受信トレイ", href: "/inbox", icon: <InboxIcon />, roles: ["admin", "supervisor", "cast"] },
      { name: "ユーザー", href: "/users", icon: <UsersIcon />, roles: ["admin", "supervisor", "cast"] },
      { name: "プロフィール管理", href: "/my-photos", icon: <PhotoIcon />, roles: ["cast"] },
      { name: "解約予定", href: "/admin/cancellations", icon: <CancellationIcon />, roles: ["admin", "supervisor"] },
    ],
  },
  {
    label: "売上・精算",
    items: [
      { name: "価格設定", href: "/admin/pricing", icon: <PricingIcon />, roles: ["admin"] },
      { name: "プラン管理", href: "/admin/plans", icon: <PlanIcon />, roles: ["admin"] },
      { name: "配分ルール", href: "/admin/payout-rules", icon: <SplitIcon />, roles: ["admin"] },
      { name: "精算", href: "/admin/settlements", icon: <SettlementIcon />, roles: ["admin"] },
      { name: "売上", href: "/admin/revenue", icon: <RevenueIcon />, roles: ["admin"] },
      { name: "税率管理", href: "/admin/tax-rates", icon: <TaxIcon />, roles: ["admin"] },
    ],
  },
  {
    label: "分析",
    items: [
      { name: "マーケ分析", href: "/admin/marketing", icon: <MarketingIcon />, roles: ["admin"] },
      { name: "ファネル分析", href: "/admin/funnel", icon: <FunnelIcon />, roles: ["admin", "supervisor"] },
    ],
  },
  {
    label: "メイト・配信",
    items: [
      { name: "メイト管理", href: "/admin/staff", icon: <StaffIcon />, roles: ["admin", "supervisor"] },
      { name: "メイト写真管理", href: "/admin/cast-photos", icon: <PhotoIcon />, roles: ["admin", "supervisor"] },
      { name: "LINE公式アカウント", href: "/admin/line-accounts", icon: <LineAccountIcon />, roles: ["admin"] },
      { name: "ステップ配信", href: "/admin/step-messages", icon: <StepIcon />, roles: ["admin"] },
    ],
  },
  {
    label: "システム",
    items: [
      { name: "Webhook監視", href: "/admin/webhooks", icon: <WebhookIcon />, roles: ["admin", "supervisor"] },
      { name: "アカウント統合", href: "/admin/account-merge", icon: <UsersIcon />, roles: ["admin"] },
      { name: "監査ログ", href: "/admin/audit", icon: <AuditIcon />, roles: ["admin", "supervisor"] },
    ],
  },
];

export function SideNav({ role, isOpen, onClose, isCollapsed = false, onToggleCollapsed }: SideNavProps) {
  const pathname = usePathname();

  // ロールで絞り込み、空グループは除外
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);

  const isActiveHref = (href: string) =>
    // "/admin"（ダッシュボード）は配下の /admin/* と被るため完全一致のみ
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* モバイル用サイドバー（オーバーレイ形式・縦スクロール対応） */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col bg-white shadow-soft-lg transition-transform duration-300 lg:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-stone-100 px-6">
          <span className="text-xl font-bold tracking-tight text-stone-800">Rutin</span>
          <button
            onClick={onClose}
            aria-label="メニューを閉じる"
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {visibleGroups.map((group, gi) => (
            <div key={group.label ?? `group-${gi}`} className="space-y-1">
              {group.label && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const isActive = isActiveHref(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-terracotta/10 text-terracotta"
                        : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                    }`}
                  >
                    {item.icon}
                    {item.name}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* デスクトップ用サイドバー（折りたたみ対応） */}
      <div
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-stone-200 bg-white transition-all duration-300 lg:flex ${
          isCollapsed ? "w-16" : "w-64"
        }`}
      >
        {/* ヘッダー */}
        <div
          className={`flex h-16 shrink-0 items-center border-b border-stone-100 ${
            isCollapsed ? "justify-center px-2" : "justify-between px-5"
          }`}
        >
          {!isCollapsed && (
            <span className="text-xl font-bold tracking-tight text-stone-800">Rutin</span>
          )}
          <button
            onClick={onToggleCollapsed}
            aria-label={isCollapsed ? "メニューを展開" : "メニューを折りたたむ"}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
          >
            {isCollapsed ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            )}
          </button>
        </div>

        {/* ナビゲーション */}
        <nav className={`mt-4 flex-1 overflow-y-auto ${isCollapsed ? "space-y-2 px-2" : "space-y-4 px-3"}`}>
          {visibleGroups.map((group, gi) => (
            <div
              key={group.label ?? `group-${gi}`}
              className={
                isCollapsed
                  ? gi > 0
                    ? "space-y-1 border-t border-stone-100 pt-2"
                    : "space-y-1"
                  : "space-y-1"
              }
            >
              {group.label && !isCollapsed && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const isActive = isActiveHref(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? item.name : undefined}
                    className={`flex items-center rounded-xl py-2.5 text-sm font-medium transition-all duration-200 ${
                      isCollapsed ? "justify-center px-2" : "gap-3 px-3"
                    } ${
                      isActive
                        ? "bg-terracotta/10 text-terracotta shadow-sm"
                        : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                    }`}
                  >
                    {item.icon}
                    {!isCollapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </>
  );
}
