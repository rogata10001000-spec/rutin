"use client";

import type { AiFailureRow } from "@/actions/admin/ai-stats";
import { jstDateTime } from "./format";

const SOURCE_LABELS: Record<AiFailureRow["source"], string> = {
  manual: "チャットのボタン",
  bulk: "一括生成",
  pregen: "事前生成",
};

type Props = {
  failures: AiFailureRow[];
};

/**
 * 直近の失敗。APIキー・クォータなどの設定トラブルに気づくための一覧。
 */
export function AiFailureList({ failures }: Props) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-soft">
      <div className="border-b border-stone-100 px-5 py-4">
        <h2 className="text-sm font-bold text-stone-800">直近の失敗（最大10件）</h2>
        <p className="mt-0.5 text-xs text-stone-500">
          同じエラーが続くときは、APIキーの設定や利用上限を確認してください。
        </p>
      </div>

      {failures.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-stone-500">
          この期間に失敗した生成はありません。
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {failures.map((f) => (
            <li key={f.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:gap-4">
              <span className="w-28 shrink-0 whitespace-nowrap text-xs font-medium text-stone-500">
                {jstDateTime(f.createdAt)}
              </span>
              <span className="w-32 shrink-0 truncate whitespace-nowrap text-xs text-stone-600" title={f.staffName}>
                {f.staffName}
              </span>
              <span className="w-28 shrink-0 whitespace-nowrap text-xs text-stone-500">
                {SOURCE_LABELS[f.source]}
              </span>
              <span className="min-w-0 flex-1 break-words text-sm text-red-700">{f.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
