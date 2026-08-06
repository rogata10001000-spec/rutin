import { redirect } from "next/navigation";
import {
  createSubscriptionCheckoutForCurrentUser,
  listAvailableCasts,
  PlanCode,
} from "../../../actions/subscriptions";
import { getUserFromServerCookies } from "@/lib/auth";
import {
  checkoutErrorCodeFromResult,
  getCheckoutErrorMessage,
} from "@/lib/subscribe-checkout-errors";
import { getTrialPeriodDays, isTrialEligiblePlan, formatYen } from "@/lib/trial";
import { getFunnelCopyValues } from "@/lib/funnel-copy";
import { renderFunnelCopy } from "@/lib/funnel-copy-defs";
import { buildSubscribeCastUrl } from "@/lib/subscribe-paths";
import { CheckoutSubmitButton } from "./CheckoutSubmitButton";
import { LegalFooter } from "@/components/subscribe/LegalFooter";

const PLAN_CODES: readonly PlanCode[] = ["light", "standard", "premium"];

type PageProps = {
  searchParams?: Promise<{
    castId?: string;
    checkoutError?: string;
    gender?: string;
    canceled?: string;
    interval?: string;
    preview?: string;
  }>;
};

export default async function SubscribePlanPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const castId = params?.castId;
  // 管理画面プレビュー（下書き文言を優先表示）
  const isPreview = params?.preview === "1";
  const castBackUrl = buildSubscribeCastUrl({
    gender: params?.gender,
    canceled: params?.canceled,
    preview: params?.preview,
  });
  const checkoutErrorMessage = getCheckoutErrorMessage(params?.checkoutError);
  const trialDays = getTrialPeriodDays();

  if (!castId) {
    return (
      <main className="mx-auto min-h-screen max-w-[480px] bg-background-light px-4 py-8">
        <h1 className="text-xl font-bold text-[#2D241E]">プラン選択</h1>
        <p className="mt-3 text-sm text-[#6B5A51]">
          伴走メイトが指定されていません。伴走メイト選択からやり直してください。
        </p>
        <a
          href={castBackUrl}
          className="mt-4 inline-flex text-sm font-medium text-primary hover:text-primary-dark"
        >
          伴走メイト選択へ戻る
        </a>
      </main>
    );
  }

  // 文言取得は既存フェッチと並列にする（ホットパスへ直列 await を足さない）
  const [userToken, castsResult, copy] = await Promise.all([
    getUserFromServerCookies(),
    listAvailableCasts({}),
    getFunnelCopyValues(
      [
        "plan.nav.title",
        "plan.name.light",
        "plan.name.standard",
        "plan.name.premium",
        "plan.desc.light",
        "plan.desc.standard",
        "plan.desc.premium",
        "plan.sla.light",
        "plan.sla.standard",
        "plan.sla.premium",
        "plan.recommended.plan",
        "plan.recommended.label",
        "plan.notice.trial",
        "plan.notice.notrial",
        "plan.notice.annualHero",
        "plan.notice.annualCard",
        "plan.cta.trial",
        "plan.cta.notrial",
      ],
      { preview: isPreview }
    ),
  ]);
  const hasLineSession = userToken.ok;

  // 「おすすめ」を付けるプラン（値はプランコード。不正値はデフォルトの standard へ）
  const recommendedPlan: PlanCode = PLAN_CODES.includes(
    copy["plan.recommended.plan"] as PlanCode
  )
    ? (copy["plan.recommended.plan"] as PlanCode)
    : "standard";

  if (!castsResult.ok) {
    return (
      <main className="mx-auto min-h-screen max-w-[480px] bg-background-light px-4 py-8">
        <h1 className="text-xl font-bold text-[#2D241E]">プラン選択</h1>
        <p className="mt-3 text-sm text-[#6B5A51]">
          伴走メイト情報を取得できません。時間をおいて再度お試しください。
        </p>
      </main>
    );
  }

  const cast = castsResult.data.casts.find((item) => item.id === castId);
  if (!cast) {
    return (
      <main className="mx-auto min-h-screen max-w-[480px] bg-background-light px-4 py-8">
        <h1 className="text-xl font-bold text-[#2D241E]">プラン選択</h1>
        <p className="mt-3 text-sm text-[#6B5A51]">
          指定された伴走メイトが見つかりません。
        </p>
        <a
          href={castBackUrl}
          className="mt-4 inline-flex text-sm font-medium text-primary hover:text-primary-dark"
        >
          伴走メイト選択へ戻る
        </a>
      </main>
    );
  }

  async function startCheckout(formData: FormData) {
    "use server";
    const selectedPlan = formData.get("planCode");
    const selectedCastId = formData.get("castId");
    const selectedInterval = formData.get("interval") === "year" ? "year" : "month";

    if (
      typeof selectedPlan !== "string" ||
      typeof selectedCastId !== "string"
    ) {
      redirect(`/subscribe/plan?castId=${castId}&checkoutError=generic`);
    }

    const result = await createSubscriptionCheckoutForCurrentUser({
      castId: selectedCastId,
      planCode: selectedPlan as PlanCode,
      interval: selectedInterval,
    });

    if (result.ok) {
      redirect(result.data.checkoutUrl);
    }

    const errorCode = checkoutErrorCodeFromResult(result.error);
    const qs = new URLSearchParams({
      castId: selectedCastId,
      checkoutError: errorCode,
      interval: selectedInterval,
    });
    if (params?.gender) qs.set("gender", params.gender);
    if (params?.canceled) qs.set("canceled", params.canceled);
    if (params?.preview) qs.set("preview", params.preview);
    redirect(`/subscribe/plan?${qs.toString()}`);
  }

  const interval: "month" | "year" = params?.interval === "year" ? "year" : "month";
  const annualAvailable = cast.annualEnabled;
  const intervalHref = (iv: "month" | "year") => {
    const qs = new URLSearchParams({ castId });
    if (params?.gender) qs.set("gender", params.gender);
    if (params?.canceled) qs.set("canceled", params.canceled);
    if (params?.preview) qs.set("preview", params.preview);
    qs.set("interval", iv);
    return `/subscribe/plan?${qs.toString()}`;
  };

  return (
    <div className="min-h-screen bg-background-light">
      <main className="mx-auto flex max-w-[480px] flex-col border-x border-orange-50 bg-background-light pb-12 shadow-sm">
        <nav className="sticky top-0 z-50 flex items-center bg-background-light/90 p-4 pb-2 backdrop-blur-md">
          <a
            href={castBackUrl}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
            aria-label="伴走メイト選択に戻る"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>
              arrow_back_ios_new
            </span>
          </a>
          <h2 className="flex-1 pr-10 text-center text-lg font-bold leading-tight text-[#2D241E]">
            {copy["plan.nav.title"]}
          </h2>
        </nav>

        {checkoutErrorMessage && (
          <div className="mx-4 mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-800">
            <div className="mb-1 flex items-center gap-2 font-bold">
              <span className="material-symbols-outlined text-[20px]">error</span>
              手続きを完了できませんでした
            </div>
            <p className="text-xs leading-relaxed text-red-700">{checkoutErrorMessage}</p>
          </div>
        )}

        <div className="px-4 py-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-5">
            <div className="flex items-center gap-2 text-sm font-bold tracking-wide text-primary">
              <span className="material-symbols-outlined fill-current text-[20px]">
                verified_user
              </span>
              担当: {cast.displayName}
            </div>
            <p className="text-sm leading-relaxed text-[#2D241E]">
              {interval === "year"
                ? renderFunnelCopy(copy["plan.notice.annualHero"], { days: trialDays })
                : renderFunnelCopy(copy["plan.notice.trial"], {
                    days: trialDays,
                    price: `月額${formatYen(cast.prices.standard)}`,
                  })}
            </p>
          </div>
        </div>

        {annualAvailable && (
          <div className="px-4 pb-2">
            <div className="flex rounded-full border border-warm-border/50 bg-white p-1 text-sm font-bold">
              <a
                href={intervalHref("month")}
                className={`flex-1 rounded-full py-2 text-center transition-colors ${
                  interval === "month" ? "bg-primary text-white shadow-sm" : "text-[#6B5A51]"
                }`}
              >
                月額
              </a>
              <a
                href={intervalHref("year")}
                className={`flex-1 rounded-full py-2 text-center transition-colors ${
                  interval === "year" ? "bg-primary text-white shadow-sm" : "text-[#6B5A51]"
                }`}
              >
                年額（2ヶ月分お得）
              </a>
            </div>
          </div>
        )}

        {!hasLineSession && (
          <div className="mx-4 mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-medium text-amber-700">
            <div className="mb-1 flex items-center gap-2 font-bold">
              <span className="material-symbols-outlined text-[20px]">warning</span>
              LINE連携が必要です
            </div>
            <p className="text-xs leading-relaxed">
              ご契約には、LINE公式アカウントから届く案内リンクからのアクセスが必要です。
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4 px-4">
          {(["light", "standard", "premium"] as PlanCode[]).map((planCode) => {
            const isAnnual = interval === "year";
            const price = isAnnual ? cast.annualPrices[planCode] : cast.prices[planCode];
            const hasPriceId = Boolean(
              isAnnual
                ? cast.annualStripePriceIds?.[planCode]
                : cast.stripePriceIds?.[planCode]
            );
            const canCheckout = hasLineSession && hasPriceId;
            const priceSuffix = isAnnual ? "/年" : "/月";
            const monthlyEquivalent = isAnnual ? Math.round(price / 12) : null;
            // {price} には 月額/年額 の接頭辞込みの表記を渡す（デフォルト文言の前提）
            const notice = isAnnual
              ? renderFunnelCopy(copy["plan.notice.annualCard"], {
                  days: trialDays,
                  price: `年額${formatYen(price)}`,
                })
              : isTrialEligiblePlan(planCode)
                ? renderFunnelCopy(copy["plan.notice.trial"], {
                    days: trialDays,
                    price: `月額${formatYen(price)}`,
                  })
                : renderFunnelCopy(copy["plan.notice.notrial"], {
                    price: `月額${formatYen(price)}`,
                  });
            // 年額は全プランにトライアルが付くため常にトライアル文言
            const buttonLabel =
              isAnnual || isTrialEligiblePlan(planCode)
                ? renderFunnelCopy(copy["plan.cta.trial"], { days: trialDays })
                : copy["plan.cta.notrial"];
            const isRecommended = planCode === recommendedPlan;

            return (
              <div
                key={planCode}
                className={`ios-shadow flex flex-col gap-4 rounded-2xl border bg-white p-5 transition-all ${
                  isRecommended
                    ? "border-primary ring-1 ring-primary/20"
                    : "border-warm-border/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    {isRecommended && (
                      <span className="mb-1 w-fit rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                        {copy["plan.recommended.label"]}
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-[#2D241E]">
                      {copy[`plan.name.${planCode}`]}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-[#6B5A51]">
                      {copy[`plan.desc.${planCode}`]}
                    </p>
                    <p className="mt-1 text-xs text-[#6B5A51]">
                      返信目安: {copy[`plan.sla.${planCode}`]}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-primary">
                      {formatYen(price)}
                    </span>
                    <span className="ml-0.5 text-[10px] text-[#6B5A51]">{priceSuffix}</span>
                    {monthlyEquivalent != null && (
                      <p className="mt-0.5 text-[10px] text-[#6B5A51]">
                        月あたり約{formatYen(monthlyEquivalent)}
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-[11px] leading-relaxed text-[#6B5A51]">{notice}</p>

                {!hasPriceId && (
                  <p className="rounded-lg bg-zinc-50 py-2 text-center text-xs font-medium text-zinc-400">
                    このプランは現在準備中です
                  </p>
                )}

                <form action={startCheckout}>
                  <input type="hidden" name="castId" value={cast.id} />
                  <input type="hidden" name="planCode" value={planCode} />
                  <input type="hidden" name="interval" value={interval} />
                  <CheckoutSubmitButton
                    canCheckout={canCheckout}
                    label={canCheckout ? buttonLabel : "選択できません"}
                  />
                </form>
              </div>
            );
          })}
        </div>

        {/* 決済に至る画面のため、同意文言つきで法的リンクを常設する（特商法・定期購入表示対応） */}
        <LegalFooter withConsentNote />
      </main>
    </div>
  );
}
