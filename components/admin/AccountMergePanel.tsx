"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import {
  searchEndUsers,
  mergeEndUsers,
  type EndUserSummary,
} from "@/actions/admin/account-merge";

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

export function AccountMergePanel() {
  const { showToast, ToastContainer } = useToast();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<EndUserSummary[]>([]);
  const [searched, setSearched] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSearching, startSearch] = useTransition();
  const [isMerging, startMerge] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) {
      showToast("2文字以上で検索してください", "error");
      return;
    }
    startSearch(async () => {
      const result = await searchEndUsers(query.trim());
      if (result.ok) {
        setItems(result.data.items);
        setSearched(true);
      } else {
        showToast(result.error.message, "error");
      }
    });
  }

  const source = items.find((i) => i.id === sourceId) ?? null;
  const target = items.find((i) => i.id === targetId) ?? null;
  const canMerge = Boolean(sourceId && targetId && sourceId !== targetId);

  function handleMerge() {
    if (!sourceId || !targetId) return;
    startMerge(async () => {
      const result = await mergeEndUsers({ sourceId, targetId });
      setConfirmOpen(false);
      if (result.ok) {
        showToast("アカウントを統合しました", "success");
        setItems((prev) => prev.filter((i) => i.id !== sourceId));
        setSourceId(null);
        setTargetId(null);
      } else {
        showToast(result.error.message, "error");
      }
    });
  }

  return (
    <div className="space-y-6">
      <ToastContainer />

      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ニックネーム / メール / LINE IDで検索"
          className="min-w-[260px] flex-1 rounded-xl border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="inline-flex items-center whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {isSearching ? "検索中..." : "検索"}
        </button>
      </form>

      {searched && items.length === 0 && (
        <p className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-500">
          該当するユーザーが見つかりませんでした。
        </p>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="whitespace-nowrap px-4 py-3">統合元（削除）</th>
                <th className="whitespace-nowrap px-4 py-3">統合先（残す）</th>
                <th className="whitespace-nowrap px-4 py-3">ニックネーム</th>
                <th className="whitespace-nowrap px-4 py-3">メール</th>
                <th className="whitespace-nowrap px-4 py-3">LINE ID</th>
                <th className="whitespace-nowrap px-4 py-3">状態</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-stone-100">
                  <td className="w-px whitespace-nowrap px-4 py-3 text-center">
                    <input
                      type="radio"
                      name="source"
                      checked={sourceId === u.id}
                      onChange={() => setSourceId(u.id)}
                      aria-label="統合元に選択"
                    />
                  </td>
                  <td className="w-px whitespace-nowrap px-4 py-3 text-center">
                    <input
                      type="radio"
                      name="target"
                      checked={targetId === u.id}
                      onChange={() => setTargetId(u.id)}
                      aria-label="統合先に選択"
                    />
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 font-medium text-stone-800">
                    {u.nickname}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-stone-600">
                    {u.email ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-stone-500">
                    {u.lineUserId ? shortId(u.lineUserId) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{u.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canMerge && source && target && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-900">
            <strong>{source.nickname}</strong>（{shortId(source.id)}）を
            <strong>{target.nickname}</strong>（{shortId(target.id)}）に統合します。
            統合元のメッセージ・契約・履歴は統合先へ移動し、統合元は削除されます。
            この操作は取り消せません。
          </p>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={isMerging}
            className="mt-4 inline-flex items-center whitespace-nowrap rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            統合を実行
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="アカウントを統合しますか？"
        description="統合元の全データが統合先へ移動し、統合元は削除されます。この操作は取り消せません。"
        confirmLabel="統合する"
        cancelLabel="キャンセル"
        variant="danger"
        loading={isMerging}
        onConfirm={handleMerge}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
