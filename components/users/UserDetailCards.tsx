"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserDetail, updateEndUser } from "@/actions/users";
import { format } from "date-fns";
import { MemoSection } from "./MemoSection";
import { AssignmentHistorySection } from "./AssignmentHistorySection";
import { InlineEdit, InlineTagEdit } from "@/components/common/InlineEdit";
import { useToast } from "@/components/common/Toast";

type UserDetailCardsProps = {
  user: UserDetail;
  onUpdateUser?: typeof updateEndUser;
};

export function UserDetailCards({ user, onUpdateUser }: UserDetailCardsProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [currentNickname, setCurrentNickname] = useState(user.nickname);
  const [currentTags, setCurrentTags] = useState(user.tags);

  const handleNicknameUpdate = async (nickname: string) => {
    if (!onUpdateUser) {
      return { ok: false as const, error: { code: "UNKNOWN" as const, message: "更新機能が利用できません" } };
    }

    const result = await onUpdateUser({
      endUserId: user.id,
      nickname,
      birthday: user.birthday,
      tags: currentTags,
    });

    if (result.ok) {
      setCurrentNickname(nickname);
      router.refresh();
    }

    return result;
  };

  const handleTagsUpdate = async (tags: string[]) => {
    if (!onUpdateUser) {
      return { ok: false as const, error: { code: "UNKNOWN" as const, message: "更新機能が利用できません" } };
    }

    const result = await onUpdateUser({
      endUserId: user.id,
      nickname: currentNickname,
      birthday: user.birthday,
      tags,
    });

    if (result.ok) {
      setCurrentTags(tags);
      router.refresh();
    }

    return result;
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
      {/* 契約情報カード */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">契約情報</h2>
        <dl className="space-y-3">
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">プラン</dt>
            <dd className="text-sm font-medium text-gray-900">
              {user.planCode.charAt(0).toUpperCase() + user.planCode.slice(1)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">状態</dt>
            <dd className="text-sm font-medium text-gray-900">{user.status}</dd>
          </div>
          {user.subscription && (
            <>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">次回更新日</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {user.subscription.currentPeriodEnd
                    ? format(new Date(user.subscription.currentPeriodEnd), "yyyy/MM/dd")
                    : "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Stripe Customer</dt>
                <dd className="font-mono text-xs text-gray-500">
                  {user.subscription.stripeCustomerId.slice(0, 20)}...
                </dd>
              </div>
              {user.subscription.cancelAtPeriodEnd && (
                <div className="rounded-md bg-yellow-50 p-2 text-sm text-yellow-700">
                  期間終了時に解約予定
                </div>
              )}
            </>
          )}
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">登録日</dt>
            <dd className="text-sm font-medium text-gray-900">
              {format(new Date(user.createdAt), "yyyy/MM/dd")}
            </dd>
          </div>
        </dl>
      </div>

      {/* ポイント/ギフトカード */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">ポイント・ギフト</h2>
        <div className="mb-4 rounded-lg bg-blue-50 p-4 text-center">
          <p className="text-sm text-blue-600">残高</p>
          <p className="text-3xl font-bold text-blue-700">
            {user.pointBalance.toLocaleString()} pt
          </p>
        </div>
        <h3 className="mb-2 text-sm font-medium text-gray-700">最近のギフト</h3>
        {user.recentGifts.length > 0 ? (
          <ul className="space-y-2">
            {user.recentGifts.slice(0, 5).map((gift, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-600">{gift.giftName}</span>
                <span className="text-gray-500">
                  {format(new Date(gift.sentAt), "MM/dd")} -{gift.costPoints}pt
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">ギフト履歴なし</p>
        )}
      </div>

      {/* チェックインカード */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          チェックイン（直近7日）
        </h2>
        {user.recentCheckins.length > 0 ? (
          <div className="flex gap-2">
            {user.recentCheckins.map((checkin, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-md border p-2"
              >
                <span className="text-xs text-gray-500">
                  {format(new Date(checkin.date), "M/d")}
                </span>
                <span className="text-2xl">
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
          <p className="text-sm text-gray-400">チェックイン履歴なし</p>
        )}
      </div>

      {/* プロフィールカード */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">プロフィール</h2>
        <dl className="space-y-3">
          <div className="flex items-center justify-between">
            <dt className="text-sm text-gray-500">ニックネーム</dt>
            <dd className="text-sm font-medium text-gray-900">
              {onUpdateUser ? (
                <InlineEdit
                  value={currentNickname}
                  onSave={handleNicknameUpdate}
                  onSuccess={() => showToast("ニックネームを更新しました", "success")}
                  onError={(msg) => showToast(msg, "error")}
                  placeholder="ニックネーム"
                  displayClassName="text-right"
                />
              ) : (
                user.nickname
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">誕生日</dt>
            <dd className="text-sm font-medium text-gray-900">
              {user.birthday
                ? format(new Date(user.birthday), "MM月dd日")
                : "未設定"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">担当キャスト</dt>
            <dd className="text-sm font-medium text-gray-900">
              {user.assignedCastName ?? "未割当"}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-sm text-gray-500">タグ</dt>
            <dd>
              {onUpdateUser ? (
                <InlineTagEdit
                  tags={currentTags}
                  onSave={handleTagsUpdate}
                  onSuccess={() => showToast("タグを更新しました", "success")}
                  onError={(msg) => showToast(msg, "error")}
                />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {user.tags.length > 0 ? (
                    user.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">タグなし</span>
                  )}
                </div>
              )}
            </dd>
          </div>
        </dl>
      </div>
      </div>

      {/* ポイント取引履歴 */}
      {user.pointTransactions.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">ポイント取引履歴</h2>
          <div className="max-h-60 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">日時</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">種別</th>
                  <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">ポイント</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {user.pointTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-500">
                      {format(new Date(tx.createdAt), "MM/dd HH:mm")}
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600">{tx.reason}</td>
                    <td className={`whitespace-nowrap px-2 py-2 text-right text-xs font-medium ${
                      tx.deltaPoints > 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      {tx.deltaPoints > 0 ? "+" : ""}{tx.deltaPoints.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 契約履歴 */}
      {user.subscriptionHistory.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">契約履歴</h2>
          <div className="space-y-3">
            {user.subscriptionHistory.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {sub.planCode.charAt(0).toUpperCase() + sub.planCode.slice(1)}プラン
                  </p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(sub.createdAt), "yyyy/MM/dd")} 開始
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  sub.status === "active"
                    ? "bg-green-100 text-green-800"
                    : sub.status === "canceled"
                    ? "bg-gray-100 text-gray-600"
                    : "bg-yellow-100 text-yellow-800"
                }`}>
                  {sub.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* メモセクション */}
      <MemoSection endUserId={user.id} />

      {/* 担当変更履歴 */}
      <AssignmentHistorySection endUserId={user.id} />

      <ToastContainer />
    </div>
  );
}
