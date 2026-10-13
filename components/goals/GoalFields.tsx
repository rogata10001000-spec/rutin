"use client";

import { GOAL_CATEGORIES, GOAL_CATEGORY_LABELS, GOAL_TITLE_MAX, type GoalCategory } from "@/lib/goal-defs";

export type GoalFieldsValue = {
  category: GoalCategory | null;
  title: string;
  weeklyTarget: number | null;
};

type GoalFieldsProps = {
  value: GoalFieldsValue;
  onChange: (next: GoalFieldsValue) => void;
  disabled?: boolean;
  /** 入力欄の id 接頭辞（同じ画面に複数置くとき用） */
  idPrefix?: string;
  autoFocusTitle?: boolean;
};

/**
 * 目標の入力3点（種類・目標の一文・週の回数）。申込完了画面とメイト側の編集で共用。
 * 種類・回数は選択UI（主ボタンの塗りは使わない）。
 */
export function GoalFields({ value, onChange, disabled, idPrefix = "goal", autoFocusTitle }: GoalFieldsProps) {
  const titleId = `${idPrefix}-title`;
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-stone-700">
          種類<span className="ml-1 text-terracotta">*</span>
        </p>
        <div role="radiogroup" aria-label="目標の種類" className="flex flex-wrap gap-2">
          {GOAL_CATEGORIES.map((c) => {
            const selected = value.category === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange({ ...value, category: c })}
                className={`min-h-[44px] rounded-lg border px-4 text-sm font-medium transition-colors disabled:opacity-50 ${
                  selected
                    ? "border-terracotta bg-terracotta/10 text-terracotta"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                }`}
              >
                {GOAL_CATEGORY_LABELS[c]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor={titleId} className="mb-2 block text-sm font-medium text-stone-700">
          目標<span className="ml-1 text-terracotta">*</span>
        </label>
        <input
          id={titleId}
          type="text"
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          maxLength={GOAL_TITLE_MAX}
          disabled={disabled}
          autoFocus={autoFocusTitle}
          placeholder="例: 週3回ジムに行く"
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta disabled:opacity-50"
        />
        <p className="mt-1 text-right text-xs tabular-nums text-stone-400">
          {value.title.length}/{GOAL_TITLE_MAX}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-stone-700">
          週の回数<span className="ml-1 text-xs font-normal text-stone-400">（任意）</span>
        </p>
        <div role="radiogroup" aria-label="週の回数" className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => {
            const selected = value.weeklyTarget === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange({ ...value, weeklyTarget: selected ? null : n })}
                className={`h-11 w-11 rounded-lg border text-sm font-medium tabular-nums transition-colors disabled:opacity-50 ${
                  selected
                    ? "border-terracotta bg-terracotta/10 text-terracotta"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                }`}
              >
                {n}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={value.weeklyTarget === null}
            disabled={disabled}
            onClick={() => onChange({ ...value, weeklyTarget: null })}
            className={`h-11 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
              value.weeklyTarget === null
                ? "border-terracotta bg-terracotta/10 text-terracotta"
                : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
            }`}
          >
            決めない
          </button>
        </div>
      </div>
    </div>
  );
}
