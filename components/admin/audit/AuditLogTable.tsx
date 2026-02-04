"use client";

import { Fragment } from "react";
import type { AuditLogEntry } from "@/actions/audit";
import { format } from "date-fns";
import { useState } from "react";

type AuditLogTableProps = {
  items: AuditLogEntry[];
};

export function AuditLogTable({ items }: AuditLogTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="p-12 text-center text-stone-500 bg-white rounded-2xl border border-stone-200">
        監査ログがありません
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                日時
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                アクション
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                対象
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                実行者
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                結果
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                詳細
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 bg-white">
            {items.map((item) => (
              <Fragment key={item.id}>
                <tr className="transition-colors hover:bg-stone-50/50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                    {format(new Date(item.createdAt), "yyyy/MM/dd HH:mm:ss")}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-stone-900">
                    {item.action}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                    {item.targetType}
                    {item.targetId && (
                      <span className="ml-1 text-xs text-stone-400">
                        ({item.targetId.slice(0, 8)}...)
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                    {item.actorStaffName ?? (
                      <span className="text-stone-400">システム</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        item.success
                          ? "bg-sage/20 text-sage-800"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.success ? "成功" : "失敗"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <button
                      onClick={() =>
                        setExpandedId(expandedId === item.id ? null : item.id)
                      }
                      className="text-sm font-medium text-terracotta hover:text-[#d0694e]"
                    >
                      {expandedId === item.id ? "閉じる" : "表示"}
                    </button>
                  </td>
                </tr>
                {expandedId === item.id && (
                  <tr>
                    <td colSpan={6} className="bg-stone-50/50 px-6 py-4">
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-4 text-xs text-stone-600 font-mono">
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
