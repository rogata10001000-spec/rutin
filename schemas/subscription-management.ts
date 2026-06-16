import { z } from "zod";
import { planCodeSchema } from "@/schemas/subscriptions";

export const changePlanSchema = z.object({
  planCode: planCodeSchema,
});

export type ChangePlanInput = z.infer<typeof changePlanSchema>;

// 解約理由（解約防止フローのアンケート）
export const CANCEL_REASON_CODES = [
  "price",
  "no_effect",
  "no_time",
  "cast_mismatch",
  "dissatisfied",
  "other",
] as const;

export const cancelSubscriptionSchema = z.object({
  reasonCode: z.enum(CANCEL_REASON_CODES).optional(),
  reasonDetail: z.string().max(500, "500文字以内で入力してください").optional(),
});

export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
