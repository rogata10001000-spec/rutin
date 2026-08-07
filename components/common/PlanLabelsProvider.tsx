"use client";

import { createContext, useContext } from "react";
import { PLAN_LABELS, planLabel, type PlanLabels } from "@/lib/plan-labels";

/**
 * プラン表示名をクライアント側へ配る。
 *
 * 管理画面レイアウトが funnel_copy から解決した名前を一度だけ渡し、
 * 配下の全クライアントコンポーネント（バッジ・一覧・一括送信の差し込み）が
 * これを参照する。個々の画面がラベルマップを持たないための仕組み。
 *
 * Provider の外（申込ファネルなど）ではコード内デフォルトにフォールバックするので、
 * どこから呼んでも落ちない。
 */
const PlanLabelsContext = createContext<PlanLabels>(PLAN_LABELS);

export function PlanLabelsProvider({
  labels,
  children,
}: {
  labels: PlanLabels;
  children: React.ReactNode;
}) {
  return <PlanLabelsContext.Provider value={labels}>{children}</PlanLabelsContext.Provider>;
}

/** プラン表示名のマップを取得する */
export function usePlanLabels(): PlanLabels {
  return useContext(PlanLabelsContext);
}

/** プランコード → 表示名（未知のコードはコードをそのまま返す） */
export function usePlanLabel(planCode: string): string {
  return planLabel(planCode, useContext(PlanLabelsContext));
}
