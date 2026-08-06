"use client";

import type { AiMateStat } from "@/actions/admin/ai-stats";
import { formatCount, formatRate, jstDate } from "./format";

type Props = {
  mates: AiMateStat[];
};

/**
 * メイト別の利用状況。
 * 「採用率が低い」「スタイルメモが未設定」のメイトがフォロー対象になる、という読み方をする表。
 */
export function AiMateTable({ mates }: Props) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-soft">
      <div className="border-b border-stone-100 px-5 py-4">
        <h2 className="text-sm font-bold text-stone-800">メイト別の利用状況</h2>
        <p className="mt-0.5 text-xs text-stone-500">
          生成数の多い順。採用率が低い人・スタイル未設定の人が、声かけの対象です。
        </p>
      </div>

      {mates.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-stone-500">
          この期間にAI下書きを使ったメイトはいません。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[880px] divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50">
              <tr>
                <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  メイト
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  生成数
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  成功
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  採用
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  採用率
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-stone-500">
                  編集率
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  スタイルメモ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white">
              {mates.map((mate) => (
                <tr key={mate.staffId} className="hover:bg-stone-50/50">
                  <td className="whitespace-nowrap px-5 py-4 font-medium text-stone-800">
                    <span className="flex items-center gap-2">
                      <span className="max-w-[12rem] truncate" title={mate.displayName}>
                        {mate.displayName}
                      </span>
                      {!mate.hasStyle && (
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          スタイル未設定
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-800">
                    {formatCount(mate.generated)} 回
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                    {formatCount(mate.succeeded)} 回
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                    {formatCount(mate.adopted)} 回
                  </td>
                  <td
                    className={`whitespace-nowrap px-5 py-4 text-right font-bold ${
                      mate.adoptionRate !== null && mate.adoptionRate < 30
                        ? "text-amber-600"
                        : "text-stone-800"
                    }`}
                  >
                    {formatRate(mate.adoptionRate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-stone-600">
                    {formatRate(mate.editRate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-stone-600">
                    {mate.styleUpdatedAt ? (
                      <span className="text-stone-600">{jstDate(mate.styleUpdatedAt)} 更新</span>
                    ) : (
                      <span className="text-stone-400">未設定</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
