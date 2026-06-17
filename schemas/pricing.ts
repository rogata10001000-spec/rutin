import { z } from "zod";

// メイト別価格オーバーライド（金額のみ入力 → Stripe Price はサーバ側で自動作成）
export const pricingOverrideSchema = z.object({
  castId: z.string().uuid(),
  planCode: z.enum(["light", "standard", "premium"]),
  amountMonthly: z.number().int().positive("月額は正の整数で入力してください"),
  // 年額（任意）。未入力ならそのメイトの年額オーバーライドは設定しない（デフォルトに従う）。
  amountAnnual: z.number().int().positive("年額は正の整数で入力してください").optional(),
  active: z.boolean().optional(),
});

export const changeUserSubscriptionPriceSchema = z.object({
  endUserId: z.string().uuid("ユーザーIDが不正です"),
  mode: z.enum(["next_cycle", "immediate"], {
    errorMap: () => ({ message: "モードはnext_cycleまたはimmediateを指定してください" }),
  }),
});
