import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";
import { getInboxItems } from "@/actions/inbox";
import { getPendingCancellations } from "@/actions/admin/cancellations";
import { getWebhookStats } from "@/actions/admin/webhooks";
import { getRevenueSummary } from "@/actions/admin/revenue";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

export const dynamic = "force-dynamic";

type Tone = "neutral" | "good" | "warn" | "bad";

const toneStyles: Record<Tone, { icon: string; value: string; ring: string }> = {
  neutral: { icon: "bg-stone-100 text-stone-500", value: "text-stone-800", ring: "ring-stone-900/5" },
  good: { icon: "bg-emerald-100 text-emerald-600", value: "text-emerald-600", ring: "ring-emerald-900/5" },
  warn: { icon: "bg-amber-100 text-amber-600", value: "text-amber-600", ring: "ring-amber-900/5" },
  bad: { icon: "bg-red-100 text-red-600", value: "text-red-600", ring: "ring-red-900/5" },
};

function StatCard({
  href,
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  href: string;
  label: string;
  value: string;
  sub: string;
  icon: string;
  tone?: Tone;
}) {
  const s = toneStyles[tone];
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-soft ring-1 transition-all hover:-translate-y-0.5 hover:shadow-soft-lg ${s.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-stone-500">{label}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.icon}`}>
          <span className="material-symbols-outlined text-[20px]" aria-hidden>
            {icon}
          </span>
        </span>
      </div>
      <div className="mt-4">
        <p className={`text-3xl font-bold tabular-nums tracking-tight ${s.value}`}>{value}</p>
        <p className="mt-1 text-xs text-stone-400">{sub}</p>
      </div>
    </Link>
  );
}

function greeting(): string {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const hour = Number(hourStr) % 24;
  if (hour < 4) return "おつかれさまです";
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "おつかれさまです";
  return "こんばんは";
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
          <LoadingSkeleton className="h-4 w-24" />
          <LoadingSkeleton className="mt-4 h-8 w-20" />
          <LoadingSkeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

/**
 * KPIセクション（最重量の getInboxItems を含む）。
 * Suspense でストリーミングし、ページの枠（挨拶・クイックアクセス）を即時表示する。
 */
async function DashboardKpis({ isAdmin }: { isAdmin: boolean }) {
  const [inboxResult, cancelResult, webhookResult, revenueResult] = await Promise.all([
    getInboxItems({ filters: {} }),
    getPendingCancellations({}),
    getWebhookStats(),
    isAdmin ? getRevenueSummary({ preset: "current_month" }) : Promise.resolve(null),
  ]);

  const summary = inboxResult.ok ? inboxResult.data.summary : null;
  const total = summary?.total ?? 0;
  const replied = summary?.replied ?? 0;
  const unreplied = summary?.unreplied ?? 0;
  const notSentToday = summary?.notSentToday ?? 0;
  const compliancePct = total > 0 ? Math.round((replied / total) * 100) : 0;
  const complianceTone: Tone =
    total === 0 ? "neutral" : compliancePct >= 80 ? "good" : compliancePct >= 50 ? "warn" : "bad";

  const cancel = cancelResult.ok ? cancelResult.data.summary : null;
  const webhook = webhookResult.ok ? webhookResult.data : null;
  const revenue = revenueResult && revenueResult.ok ? revenueResult.data.summary : null;

  return (
    <>
      {/* 今日の対応バナー */}
      {summary && (unreplied > 0 || notSentToday > 0) ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <span className="material-symbols-outlined text-amber-500" aria-hidden>
            notifications_active
          </span>
          <p className="text-sm font-medium text-amber-800">
            未返信 <span className="font-bold">{unreplied}</span> 件、今日未送信{" "}
            <span className="font-bold">{notSentToday}</span> 件の対応が必要です。
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/inbox?reply=not_sent_today&bulkSelect=1"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-700 shadow-sm transition-colors hover:bg-amber-100"
            >
              まとめて送る
            </Link>
            <Link
              href="/inbox?reply=unreplied"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-amber-600"
            >
              受信トレイで対応
              <span className="material-symbols-outlined text-[16px]" aria-hidden>
                arrow_forward
              </span>
            </Link>
          </div>
        </div>
      ) : summary ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <span className="material-symbols-outlined text-emerald-500" aria-hidden>
            check_circle
          </span>
          <p className="text-sm font-medium text-emerald-800">
            今日の対応はすべて完了しています。すばらしい！
          </p>
        </div>
      ) : null}

      {/* KPI カード */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard
          href="/inbox"
          label="今日の対応率"
          value={`${compliancePct}%`}
          sub={`${replied} / ${total} 人`}
          icon="task_alt"
          tone={complianceTone}
        />
        <StatCard
          href="/inbox?reply=unreplied"
          label="未返信"
          value={`${unreplied}`}
          sub="お客様が返信を待っています"
          icon="mark_chat_unread"
          tone={unreplied > 0 ? "bad" : "good"}
        />
        <StatCard
          href="/inbox?reply=not_sent_today"
          label="今日未送信"
          value={`${notSentToday}`}
          sub="本日まだ連絡していない人"
          icon="schedule"
          tone={notSentToday > 0 ? "warn" : "good"}
        />
        <StatCard
          href="/admin/cancellations"
          label="解約予定"
          value={`${cancel?.totalCount ?? 0}`}
          sub={`今月末まで ${cancel?.endingThisMonthCount ?? 0} 件`}
          icon="person_off"
          tone={(cancel?.endingThisMonthCount ?? 0) > 0 ? "warn" : "neutral"}
        />
        {isAdmin && (
          <StatCard
            href="/admin/revenue"
            label="今月の売上（税込）"
            value={revenue ? `¥${revenue.totalInclTaxJpy.toLocaleString("ja-JP")}` : "—"}
            sub={revenue ? `本部純額 ¥${revenue.headquartersNetJpy.toLocaleString("ja-JP")}` : "取得できませんでした"}
            icon="payments"
            tone="neutral"
          />
        )}
        <StatCard
          href="/admin/webhooks"
          label="Webhook 要対応"
          value={`${webhook?.needsAttention ?? 0}`}
          sub={`本日失敗 ${webhook?.failedToday ?? 0} 件`}
          icon="sensors"
          tone={(webhook?.needsAttention ?? 0) > 0 ? "bad" : "good"}
        />
      </div>
    </>
  );
}

export default async function AdminDashboardPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  // メイトはダッシュボード対象外。受信トレイへ。
  if (staff.role === "cast") redirect("/inbox");

  const isAdmin = staff.role === "admin";

  const todayLabel = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  return (
    <div className="space-y-6">
      {/* ヘッダー（即時表示） */}
      <div>
        <p className="text-sm text-stone-400">{todayLabel}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-800">
          {greeting()}、{staff.displayName}さん
        </h1>
        <p className="mt-1 text-sm text-stone-500">今日の状況をひと目で確認できます。</p>
      </div>

      {/* KPI（重いクエリを含むためSuspenseでストリーミング） */}
      <Suspense fallback={<KpiSkeleton />}>
        <DashboardKpis isAdmin={isAdmin} />
      </Suspense>

      {/* クイックアクセス（即時表示） */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-stone-500">クイックアクセス</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { href: "/inbox", label: "受信トレイ", icon: "inbox" },
            { href: "/users", label: "ユーザー", icon: "group" },
            ...(isAdmin
              ? [
                  { href: "/admin/revenue", label: "売上", icon: "trending_up" },
                  { href: "/admin/settlements", label: "精算", icon: "receipt_long" },
                  { href: "/admin/pricing", label: "価格設定", icon: "sell" },
                ]
              : []),
            { href: "/admin/funnel", label: "ファネル分析", icon: "filter_alt" },
            { href: "/admin/cancellations", label: "解約予定", icon: "person_off" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-900"
            >
              <span className="material-symbols-outlined text-[18px] text-stone-400" aria-hidden>
                {link.icon}
              </span>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
