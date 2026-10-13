"use client";

import { useState } from "react";
import { saveGoalFromCheckout } from "@/actions/goals";
import { formatGoalSummary, type ActiveGoal } from "@/lib/goal-defs";
import { GoalFields, type GoalFieldsValue } from "./GoalFields";

type GoalFormProps = {
  sessionId: string;
  /** 既に登録済みなら表示だけにする */
  existing: ActiveGoal | null;
};

/**
 * 申込完了画面の「最初の目標」。入力3点→1ボタン。失敗しても入力は保持する。
 * 本人性は Stripe の Checkout Session ID（actions/goals.ts 参照）。
 */
export function GoalForm({ sessionId, existing }: GoalFormProps) {
  const [value, setValue] = useState<GoalFieldsValue>({ category: null, title: "", weeklyTarget: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ActiveGoal | null>(existing);

  if (saved) {
    return (
      <div className="mt-6 w-full rounded-2xl border border-stone-200 bg-white p-5 text-left">
        <p className="text-xs font-medium text-stone-500">最初の目標</p>
        <p className="mt-1 text-base font-bold text-stone-900">{formatGoalSummary(saved)}</p>
        <p className="mt-2 text-sm text-stone-600">担当のメイトに共有しました。</p>
      </div>
    );
  }

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveGoalFromCheckout({
        sessionId,
        goal: { category: value.category ?? "", title: value.title, weeklyTarget: value.weeklyTarget },
      });
      if (result.ok) {
        setSaved(result.data);
      } else {
        setError(result.error.message);
      }
    } catch {
      setError("保存できませんでした。通信環境を確認して、もう一度お試しください。入力は保持されています");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="mt-6 w-full rounded-2xl border border-stone-200 bg-white p-5 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-base font-bold text-stone-900">最初の目標を1つ</h2>
      <p className="mt-1 text-sm text-stone-600">3か月を目安に、まずはこの1つを一緒に続けます。あとから変えられます。</p>
      <div className="mt-4">
        <GoalFields value={value} onChange={setValue} disabled={saving} idPrefix="checkout-goal" />
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving || !value.category || !value.title.trim()}
        aria-busy={saving}
        className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
      >
        {saving ? "保存しています…" : "この目標で始める"}
      </button>
    </form>
  );
}
