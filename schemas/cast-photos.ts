import { z } from "zod";

// 写真取得
export const getCastPhotosSchema = z.object({
  castId: z.string().uuid("キャストIDが無効です"),
});

// 写真アップロード
export const uploadCastPhotoSchema = z.object({
  castId: z.string().uuid("キャストIDが無効です"),
  caption: z.string().max(200, "キャプションは200文字以内で入力してください").optional(),
  displayOrder: z.number().int().min(0).max(4).optional(),
});

// 写真削除
export const deleteCastPhotoSchema = z.object({
  photoId: z.string().uuid("写真IDが無効です"),
});

// 並び順変更
export const reorderCastPhotosSchema = z.object({
  castId: z.string().uuid("キャストIDが無効です"),
  photoIds: z.array(z.string().uuid()).min(1).max(5),
});

// キャプション更新
export const updateCaptionSchema = z.object({
  photoId: z.string().uuid("写真IDが無効です"),
  caption: z.string().max(200, "キャプションは200文字以内で入力してください").nullable(),
});

// 型エクスポート
export type GetCastPhotosInput = z.infer<typeof getCastPhotosSchema>;
export type UploadCastPhotoInput = z.infer<typeof uploadCastPhotoSchema>;
export type DeleteCastPhotoInput = z.infer<typeof deleteCastPhotoSchema>;
export type ReorderCastPhotosInput = z.infer<typeof reorderCastPhotosSchema>;
export type UpdateCaptionInput = z.infer<typeof updateCaptionSchema>;
