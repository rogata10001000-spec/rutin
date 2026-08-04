import { retrieveCheckoutSession } from "@/lib/stripe";
import { getTrialPeriodDays, isTrialEligiblePlan, formatYen } from "@/lib/trial";
import { DEFAULT_PLAN_PRICES, DEFAULT_ANNUAL_PRICES } from "@/lib/plan-pricing";
import { getFunnelCopyValues } from "@/lib/funnel-copy";
import { renderFunnelCopy } from "@/lib/funnel-copy-defs";

type PageProps = {
  searchParams?: Promise<{ session_id?: string; preview?: string }>;
};

export default async function SubscribeCompletePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionId = params?.session_id;
  // 管理画面プレビュー（下書き文言を優先表示・Stripe セッション不要のモック表示）
  const isPreview = params?.preview === "1" && !sessionId;
  const trialDays = getTrialPeriodDays();

  if (!sessionId && !isPreview) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-stone-900">契約確認ができません</h1>
        <p className="mt-3 text-sm text-stone-600">
          決済完了後のURLからアクセスしてください。
        </p>
      </main>
    );
  }

  // 文言取得は Stripe 照会と並列に開始する（直列 await を足さない）
  const copyPromise = getFunnelCopyValues(
    [
      "complete.trial.title",
      "complete.trial.body",
      "complete.paid.title",
      "complete.paid.body",
      "complete.next.primary",
      "complete.next.secondary",
      "complete.cta",
      "complete.note.pc",
    ],
    { preview: isPreview }
  );

  let verified = false;
  let planCode: string | null = null;
  let interval: "month" | "year" = "month";
  // 実際に契約された金額（Stripe Price の unit_amount）。表示と請求を一致させる。
  let actualAmount: number | null = null;

  if (isPreview) {
    // ===== 管理画面プレビュー専用のモック分岐 =====
    // ?preview=1 かつ session_id なしのときだけ、Stripe を呼ばずにサンプル値
    // （スタンダード・月額・トライアル開始）で完了レイアウトを描画する。
    // 実際の決済完了フロー（session_id あり）はこの分岐を通らない。
    verified = true;
    planCode = "standard";
    interval = "month";
    actualAmount = DEFAULT_PLAN_PRICES.standard;
  } else if (sessionId) {
    try {
      const session = await retrieveCheckoutSession(sessionId);
      verified = session.mode === "subscription" && session.payment_status !== "unpaid";
      planCode = session.metadata?.plan_code ?? null;
      interval = session.metadata?.billing_interval === "year" ? "year" : "month";
      const sub = session.subscription;
      if (sub && typeof sub !== "string") {
        const unitAmount = sub.items?.data?.[0]?.price?.unit_amount;
        if (typeof unitAmount === "number") actualAmount = unitAmount;
      }
    } catch {
      verified = false;
    }
  }

  const copy = await copyPromise;

  if (!verified) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-stone-900">契約確認中です</h1>
        <p className="mt-3 text-sm text-stone-600">
          決済情報を確認できませんでした。LINEに戻って、しばらくしてからお問い合わせください。
        </p>
      </main>
    );
  }

  // 実額（Stripe）を最優先。取得できない場合のみデフォルト表に基づく目安。
  const priceTable = interval === "year" ? DEFAULT_ANNUAL_PRICES : DEFAULT_PLAN_PRICES;
  const fallbackPrice =
    planCode && planCode in priceTable
      ? priceTable[planCode as keyof typeof priceTable]
      : null;
  const price = actualAmount ?? fallbackPrice;

  // {price} には 月額/年額 の接頭辞込みの表記を渡す（デフォルト文言の前提）。
  // 金額不明時は「選択プランの◯額料金」という表記でフォールバックする。
  const intervalPrefix = interval === "year" ? "年額" : "月額";
  const priceLabel =
    price != null ? `${intervalPrefix}${formatYen(price)}` : `選択プランの${intervalPrefix}料金`;

  // 年額は全プランにトライアルが付く。月額はライトのみ即時契約（トライアルなし）。
  const isTrialStart = interval === "year" || isTrialEligiblePlan(planCode ?? "");
  const title = isTrialStart
    ? renderFunnelCopy(copy["complete.trial.title"], { days: trialDays })
    : copy["complete.paid.title"];
  const body = isTrialStart
    ? renderFunnelCopy(copy["complete.trial.body"], { days: trialDays, price: priceLabel })
    : renderFunnelCopy(copy["complete.paid.body"], { price: priceLabel });

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-12 text-center">
      <div className="mb-6 rounded-full bg-primary/10 p-4">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: "40px" }}>
          check_circle
        </span>
      </div>
      <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">{body}</p>
      <p className="mt-3 text-sm text-stone-600">{copy["complete.next.primary"]}</p>
      <p className="mt-1 text-sm text-stone-600">{copy["complete.next.secondary"]}</p>
      <a
        href="line://"
        className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
      >
        {copy["complete.cta"]}
      </a>
      <p className="mt-3 text-xs text-stone-500">{copy["complete.note.pc"]}</p>
    </main>
  );
}
