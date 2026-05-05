import { redirect } from "next/navigation";
import {
  createSubscriptionCheckoutForCurrentUser,
  listAvailableCasts,
  PlanCode,
} from "../../../actions/subscriptions";
import { getUserFromServerCookies } from "@/lib/auth";

const planLabels: Record<PlanCode, string> = {
  light: "ライト",
  standard: "スタンダード",
  premium: "プレミアム",
};

const planSla: Record<PlanCode, string> = {
  light: "24時間以内",
  standard: "12時間以内",
  premium: "2時間以内",
};

const planDescription: Record<PlanCode, string> = {
  light: "気軽にメッセージで相談したい方向け",
  standard: "毎日のチェックインで継続的にサポート",
  premium: "優先返信と週次レビューで集中サポート",
};

const formatYen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

type PageProps = {
  searchParams?: Promise<{ castId?: string }>;
};

export default async function SubscribePlanPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const castId = params?.castId;
  const userToken = await getUserFromServerCookies();
  const hasLineSession = userToken.ok;

  if (!castId) {
    return (
      <main className="mx-auto min-h-screen max-w-[480px] bg-background-light px-4 py-8">
        <h1 className="text-xl font-bold text-[#2D241E]">プラン選択</h1>
        <p className="mt-3 text-sm text-[#6B5A51]">
          伴走メイトが指定されていません。伴走メイト選択からやり直してください。
        </p>
        <a
          href="/subscribe/cast"
          className="mt-4 inline-flex text-sm font-medium text-primary hover:text-primary-dark"
        >
          伴走メイト選択へ戻る
        </a>
      </main>
    );
  }

  const castsResult = await listAvailableCasts({});
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
          href="/subscribe/cast"
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

    if (
      typeof selectedPlan !== "string" ||
      typeof selectedCastId !== "string"
    ) {
      return;
    }

    const result = await createSubscriptionCheckoutForCurrentUser({
      castId: selectedCastId,
      planCode: selectedPlan as PlanCode,
    });

    if (result.ok) {
      redirect(result.data.checkoutUrl);
    }
  }

  return (
    <div className="min-h-screen bg-background-light">
      <main className="mx-auto flex max-w-[480px] flex-col border-x border-orange-50 bg-background-light pb-12 shadow-sm">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 flex items-center bg-background-light/90 p-4 pb-2 backdrop-blur-md">
          <a
            href="/subscribe/cast"
            className="flex size-10 cursor-pointer items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
            aria-label="伴走メイト選択に戻る"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>
              arrow_back_ios_new
            </span>
          </a>
          <h2 className="flex-1 pr-10 text-center text-lg font-bold leading-tight text-[#2D241E]">
            プランを選ぶ
          </h2>
        </nav>

        {/* 伴走メイト情報＋トライアル案内 */}
        <div className="px-4 py-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-5">
            <div className="flex items-center gap-2 text-sm font-bold tracking-wide text-primary">
              <span className="material-symbols-outlined fill-current text-[20px]">
                verified_user
              </span>
              担当: {cast.displayName}
            </div>
            <p className="text-sm leading-relaxed text-[#2D241E]">
              選んだプランで7日間の無料トライアルを開始します。
              トライアル期間中はいつでも解約でき、料金は発生しません。
            </p>
          </div>
        </div>

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

        {/* Plan List */}
        <div className="flex flex-col gap-4 px-4">
          {(["light", "standard", "premium"] as PlanCode[]).map((planCode) => {
            const hasPriceId = Boolean(cast.stripePriceIds?.[planCode]);
            const canCheckout = hasLineSession && hasPriceId;

            return (
              <div
                key={planCode}
                className={`ios-shadow flex flex-col gap-4 rounded-2xl border bg-white p-5 transition-all ${
                  planCode === "standard"
                    ? "border-primary ring-1 ring-primary/20"
                    : "border-warm-border/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    {planCode === "standard" && (
                      <span className="mb-1 w-fit rounded bg-primary text-[10px] font-bold text-white px-2 py-0.5">
                        おすすめ
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-[#2D241E]">
                      {planLabels[planCode]}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-[#6B5A51]">
                      {planDescription[planCode]}
                    </p>
                    <p className="mt-1 text-xs text-[#6B5A51]">
                      返信目安: {planSla[planCode]}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-primary">
                      {formatYen(cast.prices[planCode])}
                    </span>
                    <span className="ml-0.5 text-[10px] text-[#6B5A51]">/月</span>
                  </div>
                </div>

                {!hasPriceId && (
                  <p className="text-center text-xs font-medium text-zinc-400 bg-zinc-50 py-2 rounded-lg">
                    このプランは現在準備中です
                  </p>
                )}

                <form action={startCheckout}>
                  <input type="hidden" name="castId" value={cast.id} />
                  <input type="hidden" name="planCode" value={planCode} />
                  <button
                    type="submit"
                    disabled={!canCheckout}
                    className={`w-full rounded-full py-3 text-sm font-bold shadow-lg transition-all active:scale-95 ${
                      canCheckout
                        ? "bg-primary text-white shadow-primary/30 hover:bg-primary-dark"
                        : "cursor-not-allowed bg-zinc-100 text-zinc-400 shadow-none"
                    }`}
                  >
                    {canCheckout ? "このプランで7日間無料トライアル" : "選択できません"}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
