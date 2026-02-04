"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { getAssignmentHistory, type AssignmentHistoryItem } from "@/actions/assignments";

type AssignmentHistorySectionProps = {
  endUserId: string;
};

export function AssignmentHistorySection({ endUserId }: AssignmentHistorySectionProps) {
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadHistory();
  }, [endUserId]);

  const loadHistory = async () => {
    const result = await getAssignmentHistory(endUserId);
    if (result.ok) {
      setHistory(result.data.history);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">担当変更履歴</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-12 rounded bg-gray-100" />
          <div className="h-12 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">担当変更履歴</h2>
        {history.length > 3 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {isExpanded ? "折りたたむ" : `すべて表示 (${history.length}件)`}
          </button>
        )}
      </div>

      {history.length > 0 ? (
        <div className="space-y-3">
          {(isExpanded ? history : history.slice(0, 3)).map((item) => (
            <div
              key={item.id}
              className="rounded-lg border bg-gray-50 p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {item.fromCastName ?? "未割当"}
                </span>
                <span className="text-gray-400">→</span>
                <span className="text-sm font-medium text-gray-900">
                  {item.toCastName}
                </span>
              </div>
              
              {item.reason && (
                <p className="mb-2 text-sm text-gray-600">
                  理由: {item.reason}
                </p>
              )}

              {item.shadowUntil && (
                <p className="mb-2 text-sm text-yellow-700">
                  Shadow期間: {format(new Date(item.shadowUntil), "yyyy/MM/dd")}まで
                </p>
              )}

              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>実行者: {item.createdByName}</span>
                <span>
                  {format(new Date(item.createdAt), "yyyy/MM/dd HH:mm", { locale: ja })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">担当変更履歴はありません</p>
      )}
    </div>
  );
}
