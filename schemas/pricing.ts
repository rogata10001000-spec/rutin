import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で入力してください");

export const pricingOverrideSchema = z.object({
  castId: z.string().uuid(),
  planCode: z.enum(["light", "standard", "premium"]),
  stripePriceId: z.string().min(1, "Stripe Price IDが必要です"),
  amountMonthly: z.number().int().positive("金額は正の整数で入力してください"),
  validFrom: isoDate,
  active: z.boolean(),
});

export const changeUserSubscriptionPriceSchema = z.object({
  endUserId: z.string().uuid("ユーザーIDが不正です"),
  mode: z.enum(["next_cycle", "immediate"], {
    errorMap: () => ({ message: "モードはnext_cycleまたはimmediateを指定してください" }),
  }),
});
