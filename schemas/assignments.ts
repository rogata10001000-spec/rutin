import { z } from "zod";

const isoDateTime = z.string().datetime({ message: "日時形式が正しくありません" });

export const assignCastSchema = z.object({
  endUserId: z.string().uuid(),
  toCastId: z.string().uuid(),
  reason: z.string().trim().min(1, "理由を入力してください").max(200, "200文字以内で入力してください"),
  shadowUntil: isoDateTime.optional(),
});
