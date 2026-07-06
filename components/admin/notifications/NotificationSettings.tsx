"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addNewMemberNotifyRecipient,
  removeNewMemberNotifyRecipient,
  searchNotifyCandidates,
  sendTestNewMemberNotification,
  type NotifyRecipient,
  type NotifyCandidate,
} from "@/actions/admin/notifications";
import { useToast } from "@/components/common/Toast";

const STATUS_LABELS: Record<string, string> = {
  trial: "トライアル",
  active: "契約中",
  past_due: "支払い遅延",
  paused: "一時停止",
  canceled: "解約済み",
  incomplete: "未契約",
};

export function NotificationSettings({ initial }: { initial: NotifyRecipient[] }) {
  const { showToast, ToastContainer } = useToast();
  const [recipients, setRecipients] = useState<NotifyRecipient[]>(initial);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<NotifyCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const recipientIds = useMemo(
    () => new Set(recipients.map((r) => r.endUserId)),
    [recipients]
  );

  const runSearch = useCallback(async (term: string) => {
    setSearching(true);
    const result = await searchNotifyCandidates(term);
    setSearching(false);
    setCandidates(result.ok ? result.data.candidates : []);
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, pickerOpen, runSearch]);

  const openPicker = () => {
    setPickerOpen(true);
    void runSearch("");
  };

  const handleAdd = async (c: NotifyCandidate) => {
    setBusyId(c.endUserId);
    const result = await addNewMemberNotifyRecipient({ endUserId: c.endUserId });
    setBusyId(null);
    if (result.ok) {
      setRecipients((prev) =>
        prev.some((r) => r.endUserId === c.endUserId)
          ? prev
          : [...prev, { endUserId: c.endUserId, displayName: c.displayName, hasLine: true }]
      );
      showToast(`${c.displayName}さんを通知先に追加しました`, "success");
      setPickerOpen(false);
      setQuery("");
    } else {
      showToast(result.error.message, "error");
    }
  };

  const handleRemove = async (r: NotifyRecipient) => {
    setBusyId(r.endUserId);
    const result = await removeNewMemberNotifyRecipient({ endUserId: r.endUserId });
    setBusyId(null);
    if (result.ok) {
      setRecipients((prev) => prev.filter((x) => x.endUserId !== r.endUserId));
      showToast("通知先から外しました", "success");
    } else {
      showToast(result.error.message, "error");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    const result = await sendTestNewMemberNotification();
    setTesting(false);
    if (result.ok) {
      showToast(`${result.data.sent}件のLINEにテスト通知を送信しました`, "success");
    } else {
      showToast(result.error.message, "error");
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer />

      {/* 新規会員登録の通知 */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900">新規会員の登録通知</h2>
            <p className="mt-1 text-sm text-stone-500">
              新しい会員が登録（契約・トライアル開始）されると、選んだLINE宛にお知らせが届きます。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || recipients.length === 0}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? "送信中…" : "テスト通知を送る"}
          </button>
        </div>

        {/* 現在の通知先 */}
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-400">通知先</p>
          {recipients.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
              通知先が未設定です。下の「通知先を追加」から、Rutinの公式LINEに登録済みのユーザーを選んでください。
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200">
              {recipients.map((r) => (
                <li key={r.endUserId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <span className="font-bold text-stone-800">{r.displayName}さん</span>
                    {!r.hasLine && (
                      <span className="ml-2 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        LINE未連携（届きません）
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemove(r)}
                    disabled={busyId === r.endUserId}
                    className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    外す
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 追加 */}
        <div className="mt-4">
          {!pickerOpen ? (
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-terracotta px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#d0694e]"
            >
              ＋ 通知先を追加
            </button>
          ) : (
            <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder="名前で検索（LINE登録済みユーザー）"
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    setQuery("");
                  }}
                  className="shrink-0 rounded-lg px-3 py-2 text-sm font-bold text-stone-500 transition-colors hover:bg-stone-100"
                >
                  閉じる
                </button>
              </div>

              <div className="mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-stone-100 bg-white">
                {searching ? (
                  <p className="px-3 py-6 text-center text-sm text-stone-400">検索中…</p>
                ) : candidates.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-stone-400">
                    該当するLINE登録ユーザーがいません
                  </p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {candidates.map((c) => {
                      const already = recipientIds.has(c.endUserId);
                      return (
                        <li
                          key={c.endUserId}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-stone-800">{c.displayName}さん</span>
                            <span className="ml-2 whitespace-nowrap text-[11px] text-stone-400">
                              {STATUS_LABELS[c.status] ?? c.status}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleAdd(c)}
                            disabled={already || busyId === c.endUserId}
                            className="shrink-0 rounded-lg border border-terracotta/40 bg-terracotta/5 px-3 py-1.5 text-xs font-bold text-terracotta transition-colors hover:bg-terracotta/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {already ? "追加済み" : "追加"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
