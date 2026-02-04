import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で入力してください");

export const payoutRuleSchema = z.object({
  ruleType: z.literal("gift_share"),
  scopeType: z.enum(["global", "cast"]),
  castId: z.string().uuid().optional(),
  percent: z.number().min(0).max(100),
  effectiveFrom: isoDate,
  active: z.boolean(),
});
