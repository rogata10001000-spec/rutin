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

      {/* 詳細カード */}
      <UserDetailCards user={user} onUpdateUser={canManageUser ? updateEndUser : undefined} />
    </div>
  );
}

function isBirthdayToday(birthday: string): boolean {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  return birthday.slice(5) === today.slice(5);
}
