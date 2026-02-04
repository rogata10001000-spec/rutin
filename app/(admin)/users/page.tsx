import { Suspense } from "react";
import { searchUsers } from "@/actions/users";
import { UsersTable } from "@/components/users/UsersTable";
import { UserSearchBar } from "@/components/users/UserSearchBar";
import { UsersPageHeader } from "@/components/users/UsersPageHeader";
import { TableSkeleton } from "@/components/common/LoadingSkeleton";
import { EmptyState } from "@/components/common/EmptyState";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  plan?: string;
  status?: string;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const result = await searchUsers({
    query: params.q,
    filters: {
      planCodes: params.plan ? params.plan.split(",") : undefined,
      statuses: params.status ? params.status.split(",") : undefined,
    },
  });

  return (
    <div>
      <UsersPageHeader />

      <div className="mb-4">
        <UserSearchBar currentQuery={params.q ?? ""} />
      </div>

      <div className="rounded-lg border bg-white">
        <Suspense fallback={<div className="p-4"><TableSkeleton rows={10} /></div>}>
          {result.ok ? (
            result.data.items.length > 0 ? (
              <UsersTable items={result.data.items} />
            ) : (
              <EmptyState
                title="ユーザーが見つかりません"
                description="検索条件を変更してください"
              />
            )
          ) : (
            <div className="p-4 text-center text-red-600">
              {result.error.message}
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
