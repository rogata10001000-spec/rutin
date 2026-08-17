import { retrieveCheckoutSession } from "@/lib/stripe";
import { getTrialPeriodDays, isTrialEligiblePlan, formatYen } from "@/lib/trial";
import { resolvePlanPricing } from "@/lib/plan-pricing";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import type { PlanCode } from "@/lib/supabase/types";
import { getFunnelCopyValues } from "@/lib/funnel-copy";
import { renderFunnelCopy } from "@/lib/funnel-copy-defs";
import { getLineAccountForCast } from "@/lib/line-accounts";
import { getLiveContractedCastIds, getRelationshipsByLineUserId } from "@/lib/person";

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
  let castId: string | null = null;
  let lineUserId: string | null = null;
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
    // 金額は下の共通解決（現在の設定価格）に任せる
  } else if (sessionId) {
    try {
      const session = await retrieveCheckoutSession(sessionId);
      verified = session.mode === "subscription" && session.payment_status !== "unpaid";
      planCode = session.metadata?.plan_code ?? null;
      interval = session.metadata?.billing_interval === "year" ? "year" : "month";
      castId = session.metadata?.cast_id ?? null;
      lineUserId = session.metadata?.line_user_id ?? null;
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

  // 実額（Stripe）を最優先。取得できない場合は「設定されている現在価格」を使う。
  // 以前はコード内のハードコード表を見ていたため、価格改定後にStripe取得が失敗すると
  // 旧価格を「自動請求されます」と表示していた（金額表示は特商法上の説明にあたる）。
  let price = actualAmount;
  if (price == null && planCode) {
    try {
      const pricing = await resolvePlanPricing(
        createAdminSupabaseClient(),
        null,
        interval
      );
      price = pricing[planCode as PlanCode]?.amount ?? null;
    } catch {
      // 価格解決も失敗したら金額を出さない（誤った金額を見せるより無表示が安全）
      price = null;
    }
  }

  // 追加契約（2人目以降）は、そのメイトのLINEを友だち追加しないと会話が始まらない。
  // 新規契約はそのメイトのLINEから入ってきているので不要（＝出さない）。
  // ここを出し忘れると「契約したのに何も起きない」で終わる。
  let addMateFriendUrl: string | null = null;
  let addMateName: string | null = null;
  if (castId && lineUserId) {
    try {
      const admin = createAdminSupabaseClient();
      const rows = await getRelationshipsByLineUserId(admin, lineUserId);
      const personId = rows[0]?.personId ?? null;
      if (personId) {
        const liveCastIds = await getLiveContractedCastIds(admin, personId);
        if (liveCastIds.length >= 2) {
          const account = await getLineAccountForCast(castId, admin);
          addMateFriendUrl = account?.friendAddUrl ?? null;
          addMateName = account?.name ?? null;
        }
      }
    } catch {
      // 友だち追加の案内が出せなくても完了画面自体は表示する（LINEからも案内が届く）
      addMateFriendUrl = null;
    }
  }

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
      {addMateFriendUrl && (
        <div className="mt-6 w-full rounded-2xl border border-primary/20 bg-primary/5 p-5 text-left">
          <h2 className="text-sm font-bold text-primary">
            最後に{addMateName ? `「${addMateName}」` : "新しいメイト"}のLINEを友だち追加してください
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
            メイトごとにトークが分かれています。友だち追加が完了すると、このメイトとのやり取りを始められます。
          </p>
          <a
            href={addMateFriendUrl}
            className="mt-4 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark"
          >
            友だち追加する
          </a>
        </div>
      )}

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
