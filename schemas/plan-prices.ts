import { z } from "zod";

/**
 * デフォルトプラン価格作成/更新スキーマ
 * 金額のみ入力 → Stripe Price はサーバ側で自動作成（表示額=請求額を保証）。
 */
export const upsertPlanPriceSchema = z.object({
  planCode: z.enum(["light", "standard", "premium"]),
  amountMonthly: z.number().int().positive("月額は正の整数で入力してください"),
  // 年額（任意）。未入力なら年額デフォルトは設定しない。
  amountAnnual: z.number().int().positive("年額は正の整数で入力してください").optional(),
  active: z.boolean().optional(),
});

export type UpsertPlanPriceInput = z.infer<typeof upsertPlanPriceSchema>;
