export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-800">
          アナリティクス
        </h1>
        <p className="mt-2 text-sm text-amber-800">
          高度分析はMVP対象外です。開始時はInbox、Webhook監視、監査ログで運用状態を確認します。
        </p>
      </div>
    </div>
  );
}
