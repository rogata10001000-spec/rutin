import { z } from "zod";

export const sendMessageSchema = z.object({
  endUserId: z.string().uuid(),
  body: z.string().trim().min(1, "本文を入力してください").max(2000, "2000文字以内で入力してください"),
});

export const sendProxyMessageSchema = z.object({
  endUserId: z.string().uuid(),
  body: z.string().trim().min(1, "本文を入力してください").max(2000, "2000文字以内で入力してください"),
  reason: z.string().trim().max(200, "200文字以内で入力してください").optional(),
});
