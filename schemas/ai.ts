import { z } from "zod";

export const aiDraftRequestSchema = z.object({
  endUserId: z.string().uuid(),
});
