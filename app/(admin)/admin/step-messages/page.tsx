import { getStepMessages } from "@/actions/admin/step-messages";
import { StepMessagesTable } from "@/components/admin/step-messages/StepMessagesTable";
import { ErrorState } from "@/components/common/ErrorState";

export const dynamic = "force-dynamic";

export default async function StepMessagesPage() {
  const result = await getStepMessages();

  if (!result.ok) {
    return <ErrorState title="ステップ配信を読み込めませんでした" message={result.error.message} />;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">ステップ配信</h1>
        <p className="mt-1 text-sm text-stone-500">
          LINE登録（友だち追加）からの経過時間に応じて、未契約フォロワーへ自動でメッセージを送ります。契約すると以降は送られません。
        </p>
      </div>

      <StepMessagesTable items={result.data.items} />
    </div>
  );
}
