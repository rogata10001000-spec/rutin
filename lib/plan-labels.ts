import type { PlanCode } from "@/lib/supabase/types";
import { getFunnelCopyDef } from "@/lib/funnel-copy-defs";

// =============================================================
// プラン表示名の単一の真実のソース（クライアント安全・server-only を import しない）。
//
// 以前は「ライト/スタンダード/プレミアム」「Light/Standard/Premium」の
// マップが10箇所に散在しており、/admin/preview でプラン名を改名しても
// LINE通知・一括送信の差し込み・管理画面が旧名のまま残っていた。
//
// 解決の優先順位:
//   1. funnel_copy の plan.name.*（/admin/preview で運用者が設定した名前）
//   2. ここのコード内デフォルト（= funnel-copy-defs.ts の defaultValue）
//
// サーバー側は lib/funnel-copy.ts の resolvePlanLabels() を、
// クライアント側は PlanLabelsProvider / usePlanLabels() を使う。
// 新しくプラン名を出す箇所で独自のラベルマップを定義しないこと。
// =============================================================

export const PLAN_CODE_LIST: readonly PlanCode[] = ["light", "standard", "premium"];

/** funnel_copy 側のキー（plan.name.light など） */
export const PLAN_NAME_COPY_KEYS = ["plan.name.light", "plan.name.standard", "plan.name.premium"] as const;

/**
 * コード内デフォルト。funnel-copy-defs.ts の defaultValue を唯一の出典にして、
 * 同じ文字列を二重に書かない（定義がズレる余地をなくす）。
 */
export const PLAN_LABELS: Record<PlanCode, string> = {
  light: getFunnelCopyDef("plan.name.light")?.defaultValue ?? "ライト",
  standard: getFunnelCopyDef("plan.name.standard")?.defaultValue ?? "スタンダード",
  premium: getFunnelCopyDef("plan.name.premium")?.defaultValue ?? "プレミアム",
};

export type PlanLabels = Record<string, string>;

/** 未知のプランコードでも落ちないラベル解決（コード自体を返す） */
export function planLabel(planCode: string, labels?: PlanLabels): string {
  return labels?.[planCode] ?? PLAN_LABELS[planCode as PlanCode] ?? planCode;
}
