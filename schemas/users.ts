import { z } from "zod";

/**
 * ユーザー情報更新スキーマ
 */
export const updateEndUserSchema = z.object({
  endUserId: z.string().uuid("無効なユーザーIDです"),
  nickname: z.string().min(1, "ニックネームを入力してください").max(50, "ニックネームは50文字以内で入力してください"),
  birthday: z.string().date().nullable().optional(),
  tags: z.array(z.string().max(30, "タグは30文字以内で入力してください")).max(10, "タグは10個まで"),
});

export type UpdateEndUserInput = z.infer<typeof updateEndUserSchema>;

/**
 * エンドユーザー手動作成スキーマ
 */
export const createEndUserSchema = z.object({
  lineUserId: z.string().min(1, "LINE User IDを入力してください"),
  nickname: z.string().min(1, "ニックネームを入力してください").max(50, "ニックネームは50文字以内で入力してください"),
  planCode: z.enum(["light", "standard", "premium"]),
  assignedCastId: z.string().uuid("無効なキャストIDです").optional(),
});

export type CreateEndUserInput = z.infer<typeof createEndUserSchema>;
