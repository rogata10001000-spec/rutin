import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const upsertLineAccountSchema = z.object({
  id: z.string().uuid().optional(),
  castId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  isDefault: z.boolean().default(false),
  name: z.string().trim().min(1, "表示名を入力してください").max(100),
  channelId: optionalTrimmed,
  botUserId: optionalTrimmed,
  // 新規入力時のみ平文を受け取り、サーバ側で暗号化する。未入力なら既存値を維持。
  channelSecret: optionalTrimmed,
  channelAccessToken: optionalTrimmed,
  liffId: optionalTrimmed,
  richMenuUncontractedId: optionalTrimmed,
  richMenuContractedId: optionalTrimmed,
  friendAddUrl: optionalTrimmed,
  active: z.boolean().default(true),
});

export type UpsertLineAccountInput = z.input<typeof upsertLineAccountSchema>;
