import { z } from "zod";

export const sendMessageSchema = z.object({
  endUserId: z.string().uuid(),
  body: z.string().trim().min(1, "本文を入力してください").max(2000, "2000文字以内で入力してください"),
  // 会話を開いてから送信するまでの秒数（KPI: 返信1件の実作業時間）。1時間超はクライアントが送らない
  handlingSeconds: z.number().int().min(0).max(86400).optional(),
});

export const sendProxyMessageSchema = z.object({
  endUserId: z.string().uuid(),
  body: z.string().trim().min(1, "本文を入力してください").max(2000, "2000文字以内で入力してください"),
  reason: z.string().trim().max(200, "200文字以内で入力してください").optional(),
});
