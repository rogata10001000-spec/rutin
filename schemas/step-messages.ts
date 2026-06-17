import { z } from "zod";

export const STEP_TRIGGERS = ["follow", "checkout_abandoned"] as const;
export type StepTrigger = (typeof STEP_TRIGGERS)[number];

export const upsertStepMessageSchema = z
  .object({
    id: z.string().uuid().optional(),
    trigger: z.enum(STEP_TRIGGERS),
    stepOrder: z.number().int().min(0, "順番は0以上で入力してください").max(999),
    delayHours: z.number().int().min(0, "経過時間は0以上で入力してください").max(8760),
    title: z.string().max(100, "ラベルは100文字以内で入力してください").optional(),
    body: z.string().max(2000, "本文は2000文字以内で入力してください").optional(),
    imageUrl: z.string().url("画像URLが不正です").max(1000).optional().or(z.literal("")),
    active: z.boolean(),
  })
  // 本文か画像の少なくとも一方が必要
  .refine((v) => Boolean(v.body?.trim()) || Boolean(v.imageUrl), {
    message: "本文または画像のいずれかを入力してください",
    path: ["body"],
  });

export type UpsertStepMessageInput = z.infer<typeof upsertStepMessageSchema>;
