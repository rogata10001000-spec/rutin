import { z } from "zod";

export const upsertStepMessageSchema = z.object({
  id: z.string().uuid().optional(),
  stepOrder: z.number().int().min(0, "順番は0以上で入力してください").max(999),
  delayHours: z.number().int().min(0, "経過時間は0以上で入力してください").max(8760),
  title: z.string().max(100, "ラベルは100文字以内で入力してください").optional(),
  body: z.string().min(1, "本文を入力してください").max(2000, "本文は2000文字以内で入力してください"),
  active: z.boolean(),
});

export type UpsertStepMessageInput = z.infer<typeof upsertStepMessageSchema>;
