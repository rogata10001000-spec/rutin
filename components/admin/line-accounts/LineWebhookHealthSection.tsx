"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  repairLineWebhookEndpoint,
  type LineWebhookHealthItem,
} from "@/actions/admin/line-accounts";
import { useToast } from "@/components/common/Toast";

/**
 * LINE Developers 側のWebhook設定と、このシステムの期待URLの突合結果。
 *
 * Webhook URLの設定ミスは「会員のメッセージが痕跡なく消える」無音の全損になる
 * （宛先違い＝署名不一致で401破棄。ログにもDBにも残らない）。
 * コード・DBに現れない設定のため、実測して常設表示することでしか発見できない。
 */

const STATUS_META: Record<
  LineWebhookHealthItem["status"],
  { label: string; className: string; needsRepair: boolean }
> = {
  ok: { label: "接続OK", className: "bg-emerald-100 text-emerald-700", needsRepair: false },
  mismatch: { label: "URLが不一致", className: "bg-red-100 text-red-700", needsRepair: true },
  unset: { label: "URL未設定", className: "bg-red-100 text-red-700", needsRepair: true },
  inactive: { label: "Webhookがオフ", className: "bg-amber-100 text-amber-800", needsRepair: true },
  unreachable: {
    label: "確認できません",
    className: "bg-stone-100 text-stone-600",
    needsRepair: false,
  },
};

export function LineWebhookHealthSection({ items }: { items: LineWebhookHealthItem[] }) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [, startTransition] = useTransition();
  const [repairing, setRepairing] = useState<string | null>(null);

  if (items.length === 0) return null;

  const hasProblem = items.some((i) => STATUS_META[i.status].needsRepair);

  async function handleRepair(accountId: string, name: string) {
    setRepairing(accountId);
    try {
      const result = await repairLineWebhookEndpoint({ accountId });
      if (result.ok) {
        showToast(
          result.data.verified
            ? `${name} のWebhookを修正し、疎通を確認しました`
            : `${name} のWebhook URLを設定しました（疎通テストは未確認）`,
          result.data.verified ? "success" : "info"
        );
        startTransition(() => router.refresh());
      } else {
        showToast(result.error.message, "error");
      }
    } finally {
      setRepairing(null);
    }
  }

  return (
    <section>
      <ToastContainer />
      <div className="mb-3">
        <h2 className="text-lg font-bold text-stone-900">Webhook接続の状態</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          LINE Developers側に設定されているWebhook URLを実測して突合しています。
          {hasProblem && (
            <span className="font-semibold text-red-600">
              {" "}
            不一致・未設定のアカウントは会員からのメッセージが届きません。
            </span>
          )}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
        <ul className="divide-y divide-stone-100">
          {items.map((item) => {
            const meta = STATUS_META[item.status];
            return (
              <li key={item.accountId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="w-32 shrink-0 truncate text-sm font-bold text-stone-800">
                  {item.name}
                </span>
                <span
                  className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.className}`}
                >
                  {meta.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-stone-500">
                  {item.status === "mismatch" && item.configuredUrl
                    ? `設定中: ${item.configuredUrl}`
                    : item.status === "unreachable"
                      ? "アクセストークンの設定を確認してください"
                      : ""}
                </span>
                {meta.needsRepair && (
                  <button
                    type="button"
                    onClick={() => handleRepair(item.accountId, item.name)}
                    disabled={repairing !== null}
                    className="shrink-0 whitespace-nowrap rounded-full bg-terracotta px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#d0694e] disabled:opacity-50"
                  >
                    {repairing === item.accountId ? "修正中..." : "正しいURLに修正"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
