"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveGoalForUser, startNextGoalForUser } from "@/actions/goals";
import {
  formatGoalSummary,
  goalStage,
  jstDateOf,
  GOAL_CATEGORY_LABELS,
  type ActiveGoal,
} from "@/lib/goal-defs";
import { GoalFields, type GoalFieldsValue } from "@/components/goals/GoalFields";

type GoalCardProps = {
  endUserId: string;
  goal: ActiveGoal | null;
  /** テーブル未適用・取得失敗のときは欄ごと出さない（「未登録」と断定しない） */
  available: boolean;
};

type Mode = "view" | "edit" | "next";

/**
 * 受信トレイ横パネルの「目標」。表示＋編集＋「次の目標へ」。
 * ステージ（1〜3か月目／次の目標を決める）は開始日から導出する（lib/goal-defs.ts）。
 */
export function GoalCard({ endUserId, goal, available }: GoalCardProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [value, setValue] = useState<GoalFieldsValue>({
    category: goal?.category ?? null,
    title: goal?.title ?? "",
    weeklyTarget: goal?.weeklyTarget ?? null,
  });
  const [outcome, setOutcome] = useState<"achieved" | "replaced">("achieved");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available) return null;

  const today = jstDateOf(new Date());
  const stage = goal ? goalStage(goal.startedAt, today) : null;

  const openEdit = () => {
    setValue({
      category: goal?.category ?? null,
      title: goal?.title ?? "",
      weeklyTarget: goal?.weeklyTarget ?? null,
    });
    setError(null);
    setMode("edit");
  };
  const openNext = () => {
    setValue({ category: goal?.category ?? null, title: "", weeklyTarget: goal?.weeklyTarget ?? null });
    setError(null);
    setMode("next");
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const input = {
        category: value.category ?? "",
        title: value.title,
        weeklyTarget: value.weeklyTarget,
      };
      const result =
        mode === "next"
          ? await startNextGoalForUser({ endUserId, goal: input, previousOutcome: outcome })
          : await saveGoalForUser({ endUserId, goal: input });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMode("view");
      router.refresh();
    } catch {
      setError("保存できませんでした。通信環境を確認して、もう一度お試しください。入力は保持されています");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-stone-800">目標</h3>
        {mode === "view" && (
          <div className="flex items-center gap-3">
            {goal && (
              <button
                type="button"
                onClick={openNext}
                className="text-xs font-bold text-terracotta hover:underline"
              >
                次の目標へ
              </button>
            )}
            <button
              type="button"
              onClick={openEdit}
              className="text-xs font-medium text-stone-500 hover:text-stone-800 hover:underline"
            >
              {goal ? "編集" : "登録"}
            </button>
          </div>
        )}
      </div>

      {mode === "view" ? (
        goal && stage ? (
          <div className="space-y-2 text-sm">
            <p className="text-base font-bold text-stone-900">{goal.title}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-stone-600">
              <span>{GOAL_CATEGORY_LABELS[goal.category]}</span>
              {goal.weeklyTarget && <span className="tabular-nums">週{goal.weeklyTarget}回</span>}
              <span className="tabular-nums text-stone-400">{stage.days}日目</span>
            </div>
            <div
              className={`inline-flex items-center gap-2 rounded px-2 py-1 text-xs font-bold ${
                stage.month === 4 ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-700"
              }`}
            >
              <span className="tabular-nums">{stage.month === 4 ? "4か月目〜" : `${stage.month}か月目`}</span>
              <span className="font-medium">{stage.label}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-stone-400">まだ登録されていません</p>
        )
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          {mode === "next" && goal && (
            <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
              <p className="text-xs text-stone-500">いまの目標</p>
              <p className="font-medium text-stone-800">{formatGoalSummary(goal)}</p>
              <div role="radiogroup" aria-label="いまの目標の結果" className="mt-2 flex gap-2">
                {(
                  [
                    ["achieved", "達成した"],
                    ["replaced", "切り替える"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={outcome === v}
                    onClick={() => setOutcome(v)}
                    className={`min-h-[36px] rounded-lg border px-3 text-xs font-medium ${
                      outcome === v
                        ? "border-terracotta bg-terracotta/10 text-terracotta"
                        : "border-stone-200 bg-white text-stone-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <GoalFields value={value} onChange={setValue} disabled={saving} idPrefix={`goal-${mode}`} autoFocusTitle />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode("view")}
              disabled={saving}
              className="min-h-[40px] rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || !value.category || !value.title.trim()}
              aria-busy={saving}
              className="min-h-[40px] rounded-lg bg-terracotta px-4 text-sm font-bold text-white hover:bg-[#d0694e] disabled:opacity-50"
            >
              {saving ? "保存中…" : mode === "next" ? "次の目標を始める" : "目標を保存"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
