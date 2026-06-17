import { retrieveCheckoutSession } from "@/lib/stripe";
import { getCompleteMessage, getTrialPeriodDays } from "@/lib/trial";
import { DEFAULT_PLAN_PRICES, DEFAULT_ANNUAL_PRICES } from "@/lib/plan-pricing";

type PageProps = {
  searchParams?: Promise<{ session_id?: string }>;
};

export default async function SubscribeCompletePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionId = params?.session_id;
  const trialDays = getTrialPeriodDays();

  if (!sessionId) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-stone-900">契約確認ができません</h1>
        <p className="mt-3 text-sm text-stone-600">
          決済完了後のURLからアクセスしてください。
        </p>
      </main>
    );
  }

  let verified = false;
  let planCode: string | null = null;
  let interval: "month" | "year" = "month";
  try {
    const session = await retrieveCheckoutSession(sessionId);
    verified = session.mode === "subscription" && session.payment_status !== "unpaid";
    planCode = session.metadata?.plan_code ?? null;
    interval = session.metadata?.billing_interval === "year" ? "year" : "month";
  } catch {
    verified = false;
  }

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

  const priceTable = interval === "year" ? DEFAULT_ANNUAL_PRICES : DEFAULT_PLAN_PRICES;
  const price =
    planCode && planCode in priceTable
      ? priceTable[planCode as keyof typeof priceTable]
      : null;
  const trialMessage = getCompleteMessage(planCode ?? "", trialDays, price, interval);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-12 text-center">
      <div className="mb-6 rounded-full bg-primary/10 p-4">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: "40px" }}>
          check_circle
        </span>
      </div>
      <h1 className="text-2xl font-bold text-stone-900">{trialMessage.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">{trialMessage.body}</p>
      <p className="mt-3 text-sm text-stone-600">
        担当の伴走メイトからのメッセージをお待ちください。
      </p>
      <p className="mt-1 text-sm text-stone-600">
        スマホの方はLINEアプリに戻って、トークの確認をお願いします。
      </p>
      <a
        href="line://"
        className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
      >
        LINEに戻る
      </a>
      <p className="mt-3 text-xs text-stone-500">
        ※ PCでお手続きされた方は、お使いのスマホでLINEを開いてください。
      </p>
    </main>
  );
}
