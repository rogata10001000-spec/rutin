import { z } from "zod";

export const aiDraftRequestSchema = z.object({
  endUserId: z.string().uuid(),
  /** 一括生成時などにメイトが添える共通の指示（例: 週末の予定を聞いてみて） */
  instruction: z.string().trim().max(200, "指示は200文字以内で入力してください").optional(),
});
