"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { CancelDeflectionModal } from "@/components/user/CancelDeflectionModal";
import { useToast } from "@/components/common/Toast";
import { BadgeStatus } from "@/components/common/Badge";
import { SUBSCRIBE_PATHS } from "@/lib/subscribe-paths";
import type { CancelSubscriptionInput } from "@/schemas/subscription-management";
import {
  changeMyPlan,
  cancelMySubscription,
  resumeMySubscription,
  type MySubscriptionView,
  type ManagedPlanOption,
} from "@/actions/subscription-management";
import type { PlanCode } from "@/lib/supabase/types";

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function formatJaDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type PlanManagerProps = {
  subscription: MySubscriptionView;
};

export function PlanManager({ subscription }: PlanManagerProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [isPending, startTransition] = useTransition();

  const [pendingPlan, setPendingPlan] = useState<PlanCode | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ManagedPlanOption | null>(null);
  const [cancelFlowOpen, setCancelFlowOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // 解約防止フロー用：ライトへの降格オプション（対象外なら null）
  const lightOption = subscription.planOptions.find((p) => p.code === "light");
  const downgradeOption =
    lightOption && lightOption.available && !lightOption.isCurrent
      ? { label: lightOption.label, monthlyPrice: lightOption.monthlyPrice }
      : null;

  const renewalDate = formatJaDate(subscription.currentPeriodEnd);
  const trialEndDate = formatJaDate(subscription.trialEndAt);
  const isTrial = subscription.status === "trial";
  const { cancelAtPeriodEnd, canManage } = subscription;

  const refresh = () => startTransition(() => router.refresh());

  async function handleChangePlan(plan: ManagedPlanOption) {
    setBusy(true);
    setPendingPlan(plan.code);
    try {
      const result = await changeMyPlan({ planCode: plan.code });
      if (result.ok) {
        showToast(`${plan.label}プランに変更しました`, "success");
        refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } finally {
      setBusy(false);
      setPendingPlan(null);
      setConfirmTarget(null);
    }
  }

  async function handleCancel(reasonCode: string | null, reasonDetail: string) {
    setBusy(true);
    try {
      const result = await cancelMySubscription({
        reasonCode: (reasonCode ?? undefined) as CancelSubscriptionInput["reasonCode"],
        reasonDetail: reasonDetail.trim() || undefined,
      });
      if (result.ok) {
        showToast("解約予定を受け付けました", "success");
        setCancelFlowOpen(false);
        refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDowngradeToLight() {
    setBusy(true);
    try {
      const result = await changeMyPlan({ planCode: "light" });
      if (result.ok) {
        showToast("ライトプランに変更しました", "success");
        setCancelFlowOpen(false);
        refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    try {
      const result = await resumeMySubscription();
      if (result.ok) {
        showToast("解約予定を取り消しました", "success");
        refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } finally {
      setBusy(false);
    }
  }

  const disableActions = busy || isPending || !canManage;

  return (
    <div className="space-y-5">
      <ToastContainer />

      <header className="space-y-1">
        <h1 className="text-xl font-bold text-stone-800">契約・プラン</h1>
        <p className="text-sm text-stone-500">現在のご契約内容の確認と変更ができます。</p>
      </header>

      {/* 現在の契約サマリー */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-stone-500">現在のプラン</span>
          <div className="flex items-center gap-2">
            <BadgeStatus status={subscription.status} />
            {cancelAtPeriodEnd && (
              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                解約予定
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-bold text-stone-800">{subscription.planLabel}</p>
            {subscription.castName && (
              <p className="mt-1 text-sm text-stone-500">担当メイト: {subscription.castName}</p>
            )}
          </div>
          {subscription.monthlyPrice != null && (
            <p className="whitespace-nowrap text-right text-lg font-bold text-primary">
              {formatYen(subscription.monthlyPrice)}
              <span className="ml-0.5 text-xs font-medium text-stone-400">/月</span>
            </p>
          )}
        </div>

        <dl className="mt-4 space-y-1.5 border-t border-stone-100 pt-4 text-sm">
          {isTrial && trialEndDate && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-stone-500">トライアル終了日</dt>
              <dd className="whitespace-nowrap font-medium text-stone-700">{trialEndDate}</dd>
            </div>
          )}
          {renewalDate && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-stone-500">{cancelAtPeriodEnd ? "解約予定日" : "次回更新日"}</dt>
              <dd className="whitespace-nowrap font-medium text-stone-700">{renewalDate}</dd>
            </div>
          )}
        </dl>

        {cancelAtPeriodEnd && (
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
            <p className="font-bold">解約予定です</p>
            <p className="mt-1">
              {renewalDate ? `${renewalDate}まで` : "期間終了日まで"}
              ご利用いただけます。それまでは解約予定を取り消せます。
            </p>
            <button
              type="button"
              onClick={handleResume}
              disabled={busy || isPending}
              className="mt-3 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-stone-800 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
            >
              解約予定を取り消す
            </button>
          </div>
        )}
      </section>

      {!canManage && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-900">現在この契約は変更できません</h2>
          <p className="mt-2 text-xs leading-relaxed text-amber-800">
            解約済み、またはお支払い確認中の契約はこの画面から変更できません。再開したい場合は、改めてメイトを選んでご契約ください。
          </p>
          <a
            href={SUBSCRIBE_PATHS.cast}
            className="mt-3 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark"
          >
            メイトを選ぶ
          </a>
        </section>
      )}

      {/* プラン変更 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-stone-700">プランを変更する</h2>

        {cancelAtPeriodEnd && (
          <p className="rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-500">
            解約予定中はプランを変更できません。先に解約予定を取り消してください。
          </p>
        )}

        <div className="space-y-3">
          {subscription.planOptions.map((plan) => {
            const changeable =
              !plan.isCurrent && plan.available && !cancelAtPeriodEnd && canManage;
            return (
              <div
                key={plan.code}
                className={`rounded-2xl border bg-white p-4 shadow-sm transition-all ${
                  plan.isCurrent ? "border-primary ring-1 ring-primary/20" : "border-stone-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-stone-800">{plan.label}</h3>
                      {plan.isCurrent && (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          利用中
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-words text-xs leading-relaxed text-stone-500">
                      {plan.description}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">返信目安: {plan.slaLabel}</p>
                  </div>
                  <p className="whitespace-nowrap text-right text-base font-bold text-primary">
                    {formatYen(plan.monthlyPrice)}
                    <span className="ml-0.5 text-[10px] font-medium text-stone-400">/月</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setConfirmTarget(plan)}
                  disabled={!changeable || disableActions}
                  className={`mt-3 inline-flex w-full items-center justify-center whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-bold transition-all ${
                    changeable && !disableActions
                      ? "bg-primary text-white hover:bg-primary-dark"
                      : "cursor-not-allowed bg-stone-100 text-stone-400"
                  }`}
                >
                  {plan.isCurrent
                    ? "現在のプラン"
                    : !canManage
                      ? "変更できません"
                    : !plan.available
                      ? "現在ご利用いただけません"
                      : pendingPlan === plan.code
                        ? "変更中..."
                        : "このプランに変更"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="px-1 text-[11px] leading-relaxed text-stone-400">
          プラン変更後の新しい料金は、次回の更新日から適用されます。
        </p>
      </section>

      {/* 解約 */}
      {!cancelAtPeriodEnd && canManage && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-stone-700">解約について</h2>
          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            解約すると、次回更新日でサービスが終了します。更新日まではこれまでどおりご利用いただけます。
          </p>
          <button
            type="button"
            onClick={() => setCancelFlowOpen(true)}
            disabled={disableActions}
            className="mt-3 inline-flex items-center justify-center whitespace-nowrap rounded-full border border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            解約を申し込む
          </button>
        </section>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        title="プランを変更しますか？"
        description={
          confirmTarget
            ? `${confirmTarget.label}プラン（${formatYen(
                confirmTarget.monthlyPrice
              )}/月）に変更します。新しい料金は次回更新日から適用されます。`
            : ""
        }
        confirmLabel="変更する"
        cancelLabel="やめる"
        loading={busy}
        onConfirm={() => confirmTarget && handleChangePlan(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />

      <CancelDeflectionModal
        open={cancelFlowOpen}
        downgradeOption={downgradeOption}
        renewalDateLabel={renewalDate}
        busy={busy}
        onClose={() => setCancelFlowOpen(false)}
        onDowngrade={handleDowngradeToLight}
        onConfirmCancel={handleCancel}
      />
    </div>
  );
}
