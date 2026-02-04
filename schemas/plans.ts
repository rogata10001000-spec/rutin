import { z } from "zod";

export const updatePlanSettingsSchema = z.object({
  planCode: z.enum(["light", "standard", "premium"]),
  replySlaMinutes: z.number().int().positive("SLA時間は正の整数で入力してください"),
  slaWarningMinutes: z.number().int().positive("警告時間は正の整数で入力してください"),
});
