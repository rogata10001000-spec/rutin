import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で入力してください");

export const payoutRuleSchema = z.object({
  ruleType: z.enum(["subscription_share", "gift_share"]),
  scopeType: z.enum(["global", "cast", "cast_plan"]),
  castId: z.string().uuid().optional(),
  planCode: z.enum(["light", "standard", "premium"]).optional(),
  percent: z.number().min(0).max(100),
  effectiveFrom: isoDate,
  /** 終了日（任意）。未指定なら無期限。読み取り側は以前から対応していたが設定手段が無かった。 */
  effectiveTo: isoDate.optional(),
  active: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "終了日は開始日より後にしてください",
    });
  }
  if ((value.scopeType === "cast" || value.scopeType === "cast_plan") && !value.castId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["castId"],
      message: "メイトを選択してください",
    });
  }
  if (value.scopeType === "cast_plan" && !value.planCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["planCode"],
      message: "プランを選択してください",
    });
  }
});
