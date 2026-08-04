import { getFunnelCopyForEditor } from "@/actions/admin/funnel-copy";
import { listAvailableCasts } from "@/actions/subscriptions";
import { FunnelPreviewEditor } from "@/components/admin/preview/FunnelPreviewEditor";
import { ErrorState } from "@/components/common/ErrorState";

export const dynamic = "force-dynamic";

export default async function FunnelPreviewPage() {
  const [copyResult, castsResult] = await Promise.all([
    getFunnelCopyForEditor(),
    listAvailableCasts(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">申込画面の編集</h1>
        <p className="mt-1 text-sm text-stone-500">
          ユーザーに見えている申込画面を確認しながら、文言を編集して公開できます。
        </p>
      </div>

      {copyResult.ok ? (
        <FunnelPreviewEditor
          initialEntries={copyResult.data.entries}
          casts={
            castsResult.ok
              ? castsResult.data.casts.map((c) => ({ id: c.id, displayName: c.displayName }))
              : []
          }
        />
      ) : (
        <ErrorState
          title="文言を読み込めませんでした"
          message={copyResult.error.message}
        />
      )}
    </div>
  );
}
