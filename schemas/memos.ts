import { z } from "zod";

export const memoSchema = z.object({
  endUserId: z.string().uuid(),
  category: z.string().trim().min(1, "カテゴリを選択してください"),
  pinned: z.boolean(),
  body: z.string().trim().min(1, "メモを入力してください").max(5000, "5000文字以内で入力してください"),
});
