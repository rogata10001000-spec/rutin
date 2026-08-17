"use client";

import { useState } from "react";
import { PlanManager } from "@/components/user/PlanManager";
import { SUBSCRIBE_PATHS } from "@/lib/subscribe-paths";
import type { MySubscriptionsView } from "@/actions/subscription-management";

type MyContractsProps = {
  data: MySubscriptionsView;
};

/**
 * マイページの契約一覧。
 *
 * 1契約でも複数契約でも同じ画面で表示する（[同一データの複数の出口はパリティを保つ]）。
 * 契約が1件のときは従来どおり1枚のカードだけが並ぶので、既存ユーザーの見え方は変わらない。
 */
export function MyContracts({ data }: MyContractsProps) {
  const { subscriptions, canAddMate, addMateBlockedReason, maxConcurrentMates } = data;
  const [openId, setOpenId] = useState<string | null>(
    subscriptions.length === 1 ? subscriptions[0].endUserId : null
  );

  const isMulti = subscriptions.length > 1;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-stone-800">契約・プラン</h1>
        <p className="text-sm text-stone-500">
          {isMulti
            ? `${subscriptions.length}人のメイトとご契約中です。メイトごとに内容を確認・変更できます。`
            : "現在のご契約内容の確認と変更ができます。"}
        </p>
      </header>

      {/* 契約が1件のときは開閉させず、そのまま操作できるようにする（余計な1タップを増やさない） */}
      {subscriptions.length === 1 ? (
        <PlanManager subscription={subscriptions[0]} showHeading={false} />
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => {
            const isOpen = openId === sub.endUserId;
            return (
              <section
                key={sub.endUserId}
                className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : sub.endUserId)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-stone-50"
                >
                  {sub.castPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sub.castPhotoUrl}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-base font-bold text-stone-500">
                      {sub.castName?.charAt(0) ?? "?"}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-stone-800">
                      {sub.castName ? `${sub.castName}さん` : "担当メイト未設定"}
                    </span>
                    <span className="mt-0.5 block text-sm text-stone-500">
                      {sub.planLabel}
                      {sub.monthlyPrice != null &&
                        ` ・ ¥${sub.monthlyPrice.toLocaleString("ja-JP")}${
                          sub.interval === "year" ? "/年" : "/月"
                        }`}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {sub.cancelAtPeriodEnd && (
                      <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        解約予定
                      </span>
                    )}
                    <svg
                      className={`h-5 w-5 text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-stone-200 bg-stone-50/50 px-4 py-4">
                    <PlanManager subscription={sub} showHeading={false} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* 追加契約への導線 */}
      {canAddMate ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-stone-700">別のメイトも追加する</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
            相談したいことに合わせて、別のメイトとも並行してご契約いただけます。
            いまのご契約はそのまま続きます。
          </p>
          <a
            href={SUBSCRIBE_PATHS.addMate}
            className="mt-4 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark"
          >
            メイトを追加する
          </a>
        </section>
      ) : (
        addMateBlockedReason && (
          <p className="px-1 text-xs leading-relaxed text-stone-400">
            {addMateBlockedReason === "limit_reached"
              ? `同時にご契約いただけるメイトは${maxConcurrentMates}人までです。`
              : "いま新しく受付できるメイトがいないため、追加のご契約はお受けできません。"}
          </p>
        )
      )}
    </div>
  );
}
