import { notFound } from "next/navigation";
import Link from "next/link";
import { getSettlementBatchDetail } from "@/actions/admin/settlements";
import { SettlementDetailTable } from "@/components/admin/settlements/SettlementDetailTable";
import { SettlementActions } from "@/components/admin/settlements/SettlementActions";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

const statusConfig = {
  draft: { label: "下書き", className: "bg-gray-100 text-gray-700" },
  approved: { label: "承認済", className: "bg-blue-100 text-blue-700" },
  paid: { label: "支払完了", className: "bg-green-100 text-green-700" },
};

export default async function SettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getSettlementBatchDetail({ batchId: id });

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND" || result.error.code === "FORBIDDEN") {
      notFound();
    }
    return (
      <div className="p-4 text-center text-red-600">{result.error.message}</div>
    );
  }

  const { batch, items } = result.data;
  const config = statusConfig[batch.status];

  return (
    <div>
      {/* ヘッダー */}
      <div className="mb-6">
        <Link
          href="/admin/settlements"
          className="mb-2 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          ← 精算一覧に戻る
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              精算バッチ詳細
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {format(new Date(batch.periodFrom), "yyyy/MM/dd")} -{" "}
              {format(new Date(batch.periodTo), "yyyy/MM/dd")}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${config.className}`}
            >
              {config.label}
            </span>
            <SettlementActions batch={batch} />
          </div>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">合計金額</p>
          <p className="text-2xl font-bold text-gray-900">
            ¥{batch.totalAmount.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">キャスト数</p>
          <p className="text-2xl font-bold text-gray-900">
            {batch.castCount}人
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">作成日</p>
          <p className="text-2xl font-bold text-gray-900">
            {format(new Date(batch.createdAt), "yyyy/MM/dd")}
          </p>
        </div>
      </div>

      {/* タイムライン */}
      <div className="mb-6 rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-gray-700">ステータス履歴</h2>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            <span>作成: {format(new Date(batch.createdAt), "yyyy/MM/dd HH:mm")}</span>
          </div>
          {batch.approvedAt && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <span>承認: {format(new Date(batch.approvedAt), "yyyy/MM/dd HH:mm")}</span>
            </div>
          )}
          {batch.paidAt && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              <span>支払: {format(new Date(batch.paidAt), "yyyy/MM/dd HH:mm")}</span>
            </div>
          )}
        </div>
      </div>

      {/* 明細テーブル */}
      <div className="rounded-lg border bg-white">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            キャスト別明細
          </h2>
        </div>
        <SettlementDetailTable items={items} />
      </div>
    </div>
  );
}
