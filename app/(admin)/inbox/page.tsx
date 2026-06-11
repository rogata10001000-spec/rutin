import { getInboxItems, type InboxFilters as InboxFiltersType } from "@/actions/inbox";
import { getCastOptions } from "@/actions/assignments";
import { getChatThread } from "@/actions/chat";
import { getCurrentStaff } from "@/lib/auth";
import { InboxList } from "@/components/inbox/InboxList";
import { InboxFilters } from "@/components/inbox/InboxFilters";
import { InboxAutoRefresh } from "@/components/inbox/InboxAutoRefresh";
import { ThreadReadMarker } from "@/components/inbox/ThreadReadMarker";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { ChatSidePanel } from "@/components/chat/ChatSidePanel";
import { EmptyState } from "@/components/common/EmptyState";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = {
  plan?: string;
  status?: string;
  risk?: string;
  unreported?: string;
  reply?: string;
  cast?: string;
  unassigned?: string;
  sort?: string;
  sla?: string;
  excludePaused?: string;
  todaySentZero?: string;
  q?: string;
  tags?: string;
  user?: string;
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const filters: InboxFiltersType = {
    planCodes: params.plan ? params.plan.split(",") : undefined,
    statuses: params.status ? params.status.split(",") : undefined,
    hasRisk: params.risk === "true" ? true : undefined,
    isUnreported: params.unreported === "true" ? true : undefined,
    replyStatus: params.reply as InboxFiltersType["replyStatus"] ?? undefined,
    assignedCastId: params.cast ?? undefined,
    hasUnassigned: params.unassigned === "true" ? true : undefined,
    sortBy: params.sort as InboxFiltersType["sortBy"] ?? undefined,
    slaStatus: params.sla as InboxFiltersType["slaStatus"] ?? undefined,
    excludePaused: params.excludePaused === "true" ? true : undefined,
    todaySentZero: params.todaySentZero === "true" ? true : undefined,
    query: params.q?.trim() || undefined,
    tags: params.tags ? params.tags.split(",").filter(Boolean) : undefined,
  };

  const selectedUserId = params.user;

  // データを並列で取得（ユーザー選択時はチャットスレッドも）
  const [result, castsResult, staff, chatResult] = await Promise.all([
    getInboxItems({ filters }),
    getCastOptions(),
    getCurrentStaff(),
    selectedUserId
      ? getChatThread({ endUserId: selectedUserId })
      : Promise.resolve(null),
  ]);

  const casts = castsResult.ok
    ? castsResult.data.casts.map((c) => ({ id: c.id, displayName: c.displayName }))
    : [];

  const items = result.ok ? result.data.items : [];
  const summary = result.ok ? result.data.summary : undefined;
  const availableTags = result.ok ? result.data.availableTags : [];
  const selectedItem = selectedUserId
    ? items.find((item) => item.id === selectedUserId) ?? null
    : null;

  // 選択中ユーザーへ戻る/解除するリンク（フィルタ維持）
  const listOnlyParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "user" && value) listOnlyParams.set(key, value);
  }
  const backToListHref = listOnlyParams.toString()
    ? `/inbox?${listOnlyParams.toString()}`
    : "/inbox";

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <InboxAutoRefresh intervalMs={30000} />

      {/* 左ペイン: フィルタ + 会話一覧 */}
      <aside
        className={`flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft lg:w-72 lg:shrink-0 xl:w-[24rem] ${
          selectedUserId ? "hidden lg:flex" : "flex"
        }`}
      >
        <div className="shrink-0 border-b border-stone-100 p-4">
          <h1 className="mb-3 text-lg font-bold tracking-tight text-stone-800">
            受信トレイ
          </h1>
          <InboxFilters
            currentFilters={filters}
            casts={casts}
            summary={summary}
            availableTags={availableTags}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {result.ok ? (
            items.length > 0 ? (
              <InboxList items={items} selectedUserId={selectedUserId} />
            ) : (
              <div className="p-6">
                <EmptyState
                  title="該当するユーザーがいません"
                  description="フィルタ条件を変更してみてください"
                />
              </div>
            )
          ) : (
            <div className="m-4 rounded-xl bg-red-50 p-4 text-center text-destructive">
              {result.error.message}
            </div>
          )}
        </div>
      </aside>

      {/* 中央 + 右ペイン: チャット */}
      <section
        className={`min-w-0 flex-1 ${selectedUserId ? "flex" : "hidden lg:flex"} gap-4`}
      >
        {selectedUserId && chatResult && chatResult.ok && staff ? (
          <>
            <div className="flex min-w-0 flex-1 flex-col">
              <ThreadReadMarker
                endUserId={selectedUserId}
                unreadCount={selectedItem?.unreadCount ?? 0}
                lastMessageAt={selectedItem?.lastMessageAt ?? null}
              />
              {/* モバイル用: 一覧へ戻る */}
              <Link
                href={backToListHref}
                scroll={false}
                className="mb-2 inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 shadow-sm hover:bg-stone-50 lg:hidden"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                一覧へ
              </Link>
              <div className="min-h-0 flex-1">
                <ChatContainer
                  key={selectedUserId}
                  endUserId={selectedUserId}
                  initialMessages={chatResult.data.messages}
                  sideInfo={chatResult.data.sideInfo}
                  staffRole={staff.role}
                  staffId={staff.id}
                />
              </div>
            </div>

            {/* 右ペイン: プロフィール（xl以上） */}
            <aside className="hidden w-80 shrink-0 overflow-y-auto pr-1 xl:block">
              <ChatSidePanel sideInfo={chatResult.data.sideInfo} endUserId={selectedUserId} />
            </aside>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-soft">
            <EmptyState
              title={selectedUserId ? "会話を表示できません" : "会話を選択してください"}
              description={
                selectedUserId
                  ? "このユーザーのチャットにアクセスできないか、見つかりませんでした"
                  : "左の一覧からユーザーを選ぶとトークが表示されます"
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
