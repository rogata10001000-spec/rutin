"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  getBirthdayStatus,
  markBirthdayCongratulated,
  type BirthdayStatus,
} from "@/actions/memos";
import { useToast } from "@/components/common/Toast";

// お祝いテンプレート
export const BIRTHDAY_TEMPLATES = [
  "お誕生日おめでとうございます！素敵な一年になりますように",
  "Happy Birthday! 素敵な一日をお過ごしください",
  "お誕生日おめでとうございます！今日は特別な日ですね",
] as const;

type BirthdayWidgetProps = {
  endUserId: string;
  onInsertTemplate: (text: string) => void;
};

export function BirthdayWidget({ endUserId, onInsertTemplate }: BirthdayWidgetProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [status, setStatus] = useState<BirthdayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    loadStatus();
  }, [endUserId]);

  const loadStatus = async () => {
    const result = await getBirthdayStatus(endUserId);
    if (result.ok) {
      setStatus(result.data);
    }
    setLoading(false);
  };

  const handleInsertTemplate = (template: string) => {
    onInsertTemplate(template);
    setShowTemplates(false);
  };

  const handleMarkCongratulated = async () => {
    if (!status) return;

    setMarking(true);

    // 楽観的更新: UIを即座に更新
    const previousStatus = { ...status };
    setStatus({
      ...status,
      hasSentThisYear: true,
      sentByName: "あなた",
      sentAt: new Date().toISOString(),
    });

    const result = await markBirthdayCongratulated({ endUserId });
    if (result.ok) {
      showToast("お祝い送信済みとしてマークしました", "success");
      router.refresh();
    } else {
      // 失敗時はロールバック
      setStatus(previousStatus);
      showToast(result.error.message, "error");
    }
    setMarking(false);
  };

  // 誕生日でない、または読み込み中の場合は何も表示しない
  if (loading || !status || !status.isBirthdayToday) {
    return null;
  }

  return (
    <>
      <div className="mb-2 rounded-lg border border-pink-200 bg-pink-50 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎂</span>
            <div>
              <p className="font-medium text-pink-800">
                今日はお誕生日です！
              </p>
              {status.hasSentThisYear ? (
                <p className="text-sm text-pink-600">
                  {status.sentByName}さんが
                  {status.sentAt
                    ? format(new Date(status.sentAt), "M/d HH:mm", { locale: ja })
                    : ""}
                  に送信済み
                </p>
              ) : (
                <p className="text-sm text-pink-600">
                  お祝いメッセージを送りましょう
                </p>
              )}
            </div>
          </div>

          {!status.hasSentThisYear && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-700"
              >
                テンプレ挿入
              </button>
              <button
                onClick={handleMarkCongratulated}
                disabled={marking}
                className="rounded-md border border-pink-300 bg-white px-3 py-1.5 text-sm font-medium text-pink-700 hover:bg-pink-50 disabled:opacity-50"
              >
                {marking ? "..." : "送信済みにする"}
              </button>
            </div>
          )}
        </div>

        {/* テンプレート選択 */}
        {showTemplates && (
          <div className="mt-3 space-y-2 border-t border-pink-200 pt-3">
            <p className="text-sm font-medium text-pink-700">テンプレートを選択:</p>
            {BIRTHDAY_TEMPLATES.map((template, i) => (
              <button
                key={i}
                onClick={() => handleInsertTemplate(template)}
                className="block w-full rounded-md border border-pink-200 bg-white p-2 text-left text-sm text-gray-700 hover:bg-pink-100"
              >
                {template}
              </button>
            ))}
          </div>
        )}
      </div>

      <ToastContainer />
    </>
  );
}
