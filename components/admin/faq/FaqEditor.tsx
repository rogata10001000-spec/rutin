"use client";

import { useState } from "react";
import {
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  moveFaqItem,
  type AdminFaqItem,
} from "@/actions/admin/faq";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";

type FaqEditorProps = {
  initialItems: AdminFaqItem[];
};

type EditState = {
  id: string;
  question: string;
  answer: string;
};

export function FaqEditor({ initialItems }: FaqEditorProps) {
  const { showToast, ToastContainer } = useToast();
  const [items, setItems] = useState<AdminFaqItem[]>(initialItems);
  const [addOpen, setAddOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const withBusy = (id: string, on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleAdd = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) {
      showToast("質問と回答を入力してください", "error");
      return;
    }
    setAdding(true);
    const result = await createFaqItem({ question: newQuestion, answer: newAnswer });
    setAdding(false);
    if (result.ok) {
      setItems((prev) => [...prev, result.data.item]);
      setNewQuestion("");
      setNewAnswer("");
      setAddOpen(false);
      showToast("追加しました（非表示の状態です。内容を確認して「表示」に切り替えてください）", "success");
    } else {
      showToast(result.error.message, "error");
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const target = items.find((i) => i.id === editing.id);
    if (!target) return;
    if (!editing.question.trim() || !editing.answer.trim()) {
      showToast("質問と回答を入力してください", "error");
      return;
    }

    // 楽観的更新: 即時反映し、失敗したら元へ戻す
    const previous = items;
    setItems((prev) =>
      prev.map((i) =>
        i.id === editing.id
          ? { ...i, question: editing.question.trim(), answer: editing.answer.trim() }
          : i
      )
    );
    setEditing(null);

    withBusy(editing.id, true);
    const result = await updateFaqItem({
      id: editing.id,
      question: editing.question,
      answer: editing.answer,
      active: target.active,
    });
    withBusy(editing.id, false);

    if (result.ok) {
      showToast("保存しました", "success");
    } else {
      setItems(previous);
      showToast(result.error.message, "error");
    }
  };

  const handleToggleActive = async (item: AdminFaqItem) => {
    if (busyIds.has(item.id)) return;
    const next = !item.active;

    const previous = items;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: next } : i)));

    withBusy(item.id, true);
    const result = await updateFaqItem({
      id: item.id,
      question: item.question,
      answer: item.answer,
      active: next,
    });
    withBusy(item.id, false);

    if (result.ok) {
      showToast(next ? "表示に切り替えました" : "非表示にしました", "success");
    } else {
      setItems(previous);
      showToast(result.error.message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));

    const result = await deleteFaqItem(id);
    if (result.ok) {
      showToast("削除しました", "success");
    } else {
      setItems(previous);
      showToast(result.error.message, "error");
    }
  };

  const handleMove = async (item: AdminFaqItem, direction: "up" | "down") => {
    if (busyIds.has(item.id)) return;
    const index = items.findIndex((i) => i.id === item.id);
    const neighborIndex = direction === "up" ? index - 1 : index + 1;
    if (neighborIndex < 0 || neighborIndex >= items.length) return;

    const previous = items;
    const reordered = [...items];
    [reordered[index], reordered[neighborIndex]] = [reordered[neighborIndex], reordered[index]];
    setItems(reordered);

    withBusy(item.id, true);
    const result = await moveFaqItem({ id: item.id, direction });
    withBusy(item.id, false);

    if (!result.ok) {
      setItems(previous);
      showToast(result.error.message, "error");
    }
  };

  const pendingDeleteItem = items.find((i) => i.id === pendingDeleteId) ?? null;

  return (
    <div className="space-y-4">
      <ToastContainer />

      {/* 追加 */}
      {!addOpen ? (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-terracotta px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#d0694e]"
        >
          ＋ 質問を追加
        </button>
      ) : (
        <div className="rounded-2xl border border-terracotta/30 bg-terracotta/5 p-4">
          <p className="text-sm font-bold text-stone-800">新しい質問</p>
          <input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            maxLength={200}
            autoFocus
            placeholder="質問（例: 領収書は発行できますか？）"
            className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
          />
          <textarea
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="回答"
            className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
          />
          <p className="mt-1.5 text-xs text-stone-500">
            追加した質問は非表示で保存されます。内容を確認してから「表示」に切り替えると公開ページに出ます。
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setNewQuestion("");
                setNewAnswer("");
              }}
              disabled={adding}
              className="rounded-lg px-3 py-2 text-sm font-bold text-stone-500 transition-colors hover:bg-stone-100 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={adding || !newQuestion.trim() || !newAnswer.trim()}
              className="rounded-lg bg-terracotta px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? "追加中..." : "追加する"}
            </button>
          </div>
        </div>
      )}

      {/* 一覧 */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">
          まだ質問がありません。「＋ 質問を追加」から作成してください。
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => {
            const busy = busyIds.has(item.id);
            const isEditing = editing?.id === item.id;
            return (
              <li
                key={item.id}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-soft"
              >
                {isEditing ? (
                  <div>
                    <input
                      type="text"
                      value={editing.question}
                      onChange={(e) =>
                        setEditing((prev) => (prev ? { ...prev, question: e.target.value } : prev))
                      }
                      maxLength={200}
                      autoFocus
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
                    />
                    <textarea
                      value={editing.answer}
                      onChange={(e) =>
                        setEditing((prev) => (prev ? { ...prev, answer: e.target.value } : prev))
                      }
                      maxLength={2000}
                      rows={4}
                      className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 shadow-sm focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta"
                    />
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded-lg px-3 py-2 text-sm font-bold text-stone-500 transition-colors hover:bg-stone-100"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit()}
                        disabled={!editing.question.trim() || !editing.answer.trim()}
                        className="rounded-lg bg-terracotta px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#d0694e] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        保存する
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    {/* 並び替え */}
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => void handleMove(item, "up")}
                        disabled={busy || index === 0}
                        aria-label="上へ移動"
                        className="flex size-7 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:bg-stone-50 disabled:opacity-30"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMove(item, "down")}
                        disabled={busy || index === items.length - 1}
                        aria-label="下へ移動"
                        className="flex size-7 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:bg-stone-50 disabled:opacity-30"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* 内容 */}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-bold text-stone-800">
                        <span className="min-w-0 break-words">{item.question}</span>
                        <span
                          className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            item.active
                              ? "bg-green-100 text-green-700"
                              : "bg-stone-100 text-stone-500"
                          }`}
                        >
                          {item.active ? "表示中" : "非表示"}
                        </span>
                      </p>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-500">
                        {item.answer}
                      </p>
                    </div>

                    {/* 操作 */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(item)}
                        disabled={busy}
                        aria-busy={busy}
                        className="whitespace-nowrap rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-50"
                      >
                        {item.active ? "非表示にする" : "表示する"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ id: item.id, question: item.question, answer: item.answer })
                        }
                        disabled={busy}
                        className="whitespace-nowrap rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-50"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(item.id)}
                        disabled={busy}
                        className="whitespace-nowrap rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 削除確認（楽観的削除に切り替えるため loading は渡さない） */}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="この質問を削除しますか？"
        description={
          pendingDeleteItem
            ? `「${pendingDeleteItem.question}」を削除します。削除すると元に戻せません。一時的に隠したい場合は「非表示にする」をお使いください。`
            : ""
        }
        confirmLabel="削除する"
        variant="danger"
        onConfirm={() => {
          const id = pendingDeleteId;
          setPendingDeleteId(null);
          if (id) void handleDelete(id);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
