import { z } from "zod";
import { planCodeSchema } from "@/schemas/subscriptions";

export const changePlanSchema = z.object({
  planCode: planCodeSchema,
});

export type ChangePlanInput = z.infer<typeof changePlanSchema>;
