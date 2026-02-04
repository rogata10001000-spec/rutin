import { z } from "zod";

export const planCodeSchema = z.enum(["light", "standard", "premium"]);

export const listAvailableCastsSchema = z.object({
  planCode: planCodeSchema.optional(),
});

export const createSubscriptionCheckoutSchema = z.object({
  lineUserId: z.string().min(1, "LINEユーザーIDが必要です"),
  castId: z.string().uuid(),
  planCode: planCodeSchema,
});
