import { getMySubscription } from "@/actions/subscription-management";
import { PlanManager } from "@/components/user/PlanManager";
import { SUBSCRIBE_PATHS } from "@/lib/subscribe-paths";

export const dynamic = "force-dynamic";

export default async function AccountPlanPage() {
  const result = await getMySubscription();

  if (!result.ok) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-lg font-bold text-amber-900">ご契約情報を表示できません</h1>
        <p className="mt-2 text-sm leading-relaxed text-amber-800">{result.error.message}</p>
      </div>
    );
  }

  if (!result.data.hasSubscription || !result.data.subscription) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-stone-800">ご契約中のプランはありません</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          メイトを選んで、無料トライアルからご契約いただけます。
        </p>
        <a
          href={SUBSCRIBE_PATHS.cast}
          className="mt-4 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark"
        >
          メイトを選ぶ
        </a>
      </div>
    );
  }

  return <PlanManager subscription={result.data.subscription} />;
}
