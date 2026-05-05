import { z } from "zod";

export const planCodeSchema = z.enum(["light", "standard", "premium"]);

export const castGenderSchema = z.enum(["female", "male", "other"]);
export const castGenderFilterSchema = z.union([castGenderSchema, z.literal("all")]);

export const listAvailableCastsSchema = z.object({
  planCode: planCodeSchema.optional(),
  gender: castGenderSchema.optional(),
});

export const createSubscriptionCheckoutSchema = z.object({
  lineUserId: z.string().min(1, "LINEユーザーIDが必要です"),
  castId: z.string().uuid(),
  planCode: planCodeSchema,
});
