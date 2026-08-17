import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserDetail, updateEndUser } from "@/actions/users";
import { BadgePlan, BadgeStatus } from "@/components/common/Badge";
import { UserDetailCards } from "@/components/users/UserDetailCards";
import { UserDetailActions } from "@/components/users/UserDetailActions";
import { getCurrentStaff } from "@/lib/auth";
import { ErrorState } from "@/components/common/ErrorState";
import { BackButton } from "@/components/common/BackButton";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getUserDetail({ endUserId: id });

  if (!result.ok) {
    if (result.error.code === "NOT_FOUND" || result.error.code === "FORBIDDEN") {
      notFound();
    }
    return <ErrorState title="ユーザー情報を読み込めませんでした" message={result.error.message} />;
  }

  const user = result.data;
  const staff = await getCurrentStaff();
  const canManageUser = staff?.role === "admin" || staff?.role === "supervisor";

  return (
    <div>
      {/* 戻る（遷移元へ。直リンク時はユーザー一覧へ） */}
      <div className="mb-4">
        <BackButton fallbackHref="/users" />
      </div>

      {/* ヘッダー */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-stone-900">{user.nickname}</h1>
            {user.birthday && isBirthdayToday(user.birthday) && (
              <span className="text-2xl">🎂</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <BadgePlan plan={user.planCode as "light" | "standard" | "premium"} />
            <BadgeStatus status={user.status as "trial" | "active" | "past_due" | "paused" | "canceled" | "incomplete"} />
            {user.isBlocked && (
              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
                🚫 ブロック中
              </span>
            )}
            {user.assignedCastName && (
              <span className="text-sm text-stone-500">
                担当: {user.assignedCastName}
              </span>
            )}
          </div>
        </div>
        <UserDetailActions user={user} canManage={canManageUser} />
      </div>

      {/* 同一人物の別メイト契約。
          複数メイト契約では同じ人が会員一覧に複数行として現れるため、
          ここを出さないと「別人」と誤認して対応履歴を取り違える。 */}
      {user.otherContracts.length > 0 && (
        <section className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
          <h2 className="text-sm font-bold text-indigo-900">
            同じ方の他のメイトとの契約（{user.otherContracts.length}件）
          </h2>
          <p className="mt-1 text-xs text-indigo-800">
            メイトごとに会話・チェックイン・契約が分かれています。この画面は
            {user.assignedCastName ? `「${user.assignedCastName}」` : "このメイト"}との関係のみを表示しています。
          </p>
          <ul className="mt-3 space-y-2">
            {user.otherContracts.map((c) => (
              <li key={c.endUserId}>
                <Link
                  href={`/users/${c.endUserId}`}
                  className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm transition-colors hover:bg-indigo-50"
                >
                  <span className="w-28 shrink-0 truncate font-medium text-stone-800">
                    {c.castName ?? "担当未設定"}
                  </span>
                  <BadgePlan plan={c.planCode as "light" | "standard" | "premium"} />
                  <BadgeStatus
                    status={
                      c.status as
                        | "trial"
                        | "active"
                        | "past_due"
                        | "paused"
                        | "canceled"
                        | "incomplete"
                    }
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 詳細カード */}
      <UserDetailCards user={user} onUpdateUser={canManageUser ? updateEndUser : undefined} />
    </div>
  );
}

function isBirthdayToday(birthday: string): boolean {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  return birthday.slice(5) === today.slice(5);
}
