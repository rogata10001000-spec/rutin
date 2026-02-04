"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { WebhookEvent } from "@/actions/admin/webhooks";

type WebhookEventsTableProps = {
  items: WebhookEvent[];
};

export function WebhookEventsTable({ items }: WebhookEventsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-stone-400">
        Webhookイベントがありません
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                プロバイダ
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                イベントタイプ
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                受信日時
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                処理
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                状態
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 bg-white">
            {items.map((item) => (
              <>
                <tr
                  key={item.id}
                  className={`cursor-pointer transition-colors hover:bg-stone-50/50 ${
                    !item.success ? "bg-red-50/50" : ""
                  }`}
                  onClick={() => toggleExpand(item.id)}
                >
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        item.provider === "line"
                          ? "bg-[#06C755]/10 text-[#06C755]"
                          : "bg-[#635BFF]/10 text-[#635BFF]"
                      }`}
                    >
                      {item.provider.toUpperCase()}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-stone-600">
                    {item.eventType}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                    {format(new Date(item.receivedAt), "yyyy/MM/dd HH:mm:ss", { locale: ja })}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                    {item.processedAt
                      ? format(new Date(item.processedAt), "HH:mm:ss", { locale: ja })
                      : "-"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        item.success
                          ? "bg-sage/20 text-sage-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {item.success ? "成功" : "失敗"}
                    </span>
                  </td>
                </tr>
                {expandedId === item.id && (
                  <tr key={`${item.id}-detail`}>
                    <td colSpan={5} className="bg-stone-50/50 px-6 py-4">
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-bold text-stone-700">Event ID:</span>{" "}
                          <span className="font-mono text-stone-600">{item.eventId}</span>
                        </div>
                        {item.errorMessage && (
                          <div>
                            <span className="font-bold text-red-700">エラー:</span>{" "}
                            <span className="text-red-600">{item.errorMessage}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
