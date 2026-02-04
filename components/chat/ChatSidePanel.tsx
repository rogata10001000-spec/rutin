"use client";

import Link from "next/link";
import type { ChatSideInfo } from "@/actions/chat";
import { format } from "date-fns";
import { MemoEditor } from "./MemoEditor";

type ChatSidePanelProps = {
  sideInfo: ChatSideInfo;
  endUserId: string;
};

export function ChatSidePanel({ sideInfo, endUserId }: ChatSidePanelProps) {
  const isBirthdayToday = sideInfo.birthday
    ? sideInfo.birthday.slice(5) ===
      new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(5)
    : false;

  return (
    <div className="space-y-6">
      {/* プロフィールカード */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-stone-800">プロフィール</h3>
          <Link
            href={`/users/${endUserId}`}
            className="text-xs font-bold text-terracotta hover:text-[#d0694e] hover:underline"
          >
            詳細
          </Link>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">プラン</dt>
            <dd className="font-bold text-stone-800">
              {sideInfo.planCode.charAt(0).toUpperCase() + sideInfo.planCode.slice(1)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">状態</dt>
            <dd className="font-medium text-stone-700">{sideInfo.status}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">残高</dt>
            <dd className="font-bold text-terracotta">
              {sideInfo.pointBalance.toLocaleString()} pt
            </dd>
          </div>
          {sideInfo.birthday && (
            <div className="flex justify-between">
              <dt className="text-stone-500">誕生日</dt>
              <dd className="flex items-center gap-1 font-medium text-stone-700">
                {format(new Date(sideInfo.birthday), "MM/dd")}
                {isBirthdayToday && <span>🎂</span>}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* チェックイン */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
        <h3 className="mb-4 font-bold text-stone-800">チェックイン</h3>
        {sideInfo.recentCheckins.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sideInfo.recentCheckins.map((checkin, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 min-w-[3rem]"
              >
                <span className="text-xs font-medium text-stone-500 mb-1">
                  {format(new Date(checkin.date), "M/d")}
                </span>
                <span className={`text-lg font-bold ${
                  checkin.status === "circle" ? "text-green-500" :
                  checkin.status === "triangle" ? "text-yellow-500" : "text-red-500"
                }`}>
                  {checkin.status === "circle"
                    ? "◯"
                    : checkin.status === "triangle"
                    ? "△"
                    : "×"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-400 text-center py-2">履歴なし</p>
        )}
      </div>

      {/* ピン留めメモ */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
        <h3 className="mb-4 font-bold text-stone-800 flex items-center gap-2">
          <span>📌</span> ピン留めメモ
        </h3>
        {sideInfo.pinnedMemos.length > 0 ? (
          <div className="space-y-3">
            {sideInfo.pinnedMemos.map((memo) => (
              <div
                key={memo.id}
                className="rounded-xl border border-yellow-200 bg-yellow-50/50 p-3 text-sm shadow-sm"
              >
                <span className="mb-1.5 block text-xs font-bold text-yellow-700 uppercase tracking-wide">
                  {memo.category}
                </span>
                <p className="text-stone-700 leading-relaxed">{memo.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-400 text-center py-2">ピン留めメモなし</p>
        )}
      </div>

      {/* メモ編集 */}
      <MemoEditor endUserId={endUserId} />
    </div>
  );
}
