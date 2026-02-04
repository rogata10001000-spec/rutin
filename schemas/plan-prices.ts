import { z } from "zod";

/**
 * デフォルトプラン価格作成/更新スキーマ
 */
export const upsertPlanPriceSchema = z.object({
  id: z.string().uuid().optional(),
  planCode: z.enum(["light", "standard", "premium"]),
  stripePriceId: z.string().min(1, "Stripe Price IDを入力してください"),
  amountMonthly: z.number().int().positive("金額は正の整数で入力してください"),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "有効開始日を入力してください"),
  active: z.boolean(),
});

export type UpsertPlanPriceInput = z.infer<typeof upsertPlanPriceSchema>;
