"use server";

import { revalidatePath } from "next/cache";
import {
  getCastPhotosSchema,
  uploadCastPhotoSchema,
  deleteCastPhotoSchema,
  reorderCastPhotosSchema,
  updateCaptionSchema,
} from "@/schemas/cast-photos";
import { Result, toZodErrorMessage } from "./types";
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from "@/lib/supabase/server";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

const BUCKET_NAME = "cast-photos";
const MAX_PHOTOS_PER_CAST = 5;

// =====================================
// 型定義
// =====================================

export type CastPhoto = {
  id: string;
  url: string;
  caption: string | null;
  displayOrder: number;
};

// =====================================
// 写真一覧取得（公開API）
// =====================================

export type GetCastPhotosResult = Result<{ photos: CastPhoto[] }>;

export async function getCastPhotos(castId: string): Promise<GetCastPhotosResult> {
  const parsed = getCastPhotosSchema.safeParse({ castId });
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const supabase = createAdminSupabaseClient();

  const { data: photos, error } = await supabase
    .from("cast_photos")
    .select("id, storage_path, caption, display_order")
    .eq("cast_id", castId)
    .eq("active", true)
    .order("display_order");

  if (error) {
    console.error("[CastPhotos] Failed to fetch photos:", error);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "写真の取得に失敗しました" },
    };
  }

  const photosWithUrls: CastPhoto[] = (photos ?? []).map((p) => ({
    id: p.id,
    url: supabase.storage.from(BUCKET_NAME).getPublicUrl(p.storage_path).data.publicUrl,
    caption: p.caption,
    displayOrder: p.display_order,
  }));

  return { ok: true, data: { photos: photosWithUrls } };
}

// =====================================
// 写真アップロード（Admin/Supervisor/本人）
// =====================================

export type UploadCastPhotoInput = {
  castId: string;
  file: File;
  caption?: string;
  displayOrder?: number;
};

export type UploadCastPhotoResult = Result<{ photoId: string; url: string }>;

export async function uploadCastPhoto(
  formData: FormData
): Promise<UploadCastPhotoResult> {
  const castId = formData.get("castId") as string;
  const file = formData.get("file") as File;
  const caption = formData.get("caption") as string | null;
  const displayOrderStr = formData.get("displayOrder") as string | null;
  const displayOrder = displayOrderStr ? parseInt(displayOrderStr, 10) : undefined;

  // バリデーション
  const parsed = uploadCastPhotoSchema.safeParse({ castId, caption, displayOrder });
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  // ファイルバリデーション
  if (!file || !(file instanceof File)) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: "ファイルが選択されていません" },
    };
  }

  if (file.size > 5 * 1024 * 1024) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: "ファイルサイズは5MB以下にしてください" },
    };
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: "JPEG、PNG、WebP形式のみ対応しています" },
    };
  }

  const supabase = await createServerSupabaseClient();
  const adminSupabase = createAdminSupabaseClient();

  // 認証チェック
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  // 権限チェック
  const { data: staffProfile } = await adminSupabase
    .from("staff_profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!staffProfile) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "スタッフ権限がありません" },
    };
  }

  const isAdminOrSupervisor = ["admin", "supervisor"].includes(staffProfile.role);
  const isSelf = staffProfile.id === castId;

  if (!isAdminOrSupervisor && !isSelf) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  // 5枚制限チェック
  const { data: limitCheck } = await adminSupabase.rpc("check_cast_photos_limit", {
    p_cast_id: castId,
  });

  if (!limitCheck) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "写真は最大5枚までです" },
    };
  }

  // 次の表示順を取得
  const { data: existingPhotos } = await adminSupabase
    .from("cast_photos")
    .select("display_order")
    .eq("cast_id", castId)
    .eq("active", true)
    .order("display_order", { ascending: false })
    .limit(1);

  const nextOrder = displayOrder ?? ((existingPhotos?.[0]?.display_order ?? -1) + 1);

  // ファイル名を生成
  const photoId = crypto.randomUUID();
  const ext = file.name.split(".").pop() || "jpg";
  const storagePath = `${castId}/${photoId}.${ext}`;

  // Storageにアップロード
  const { error: uploadError } = await adminSupabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[CastPhotos] Storage upload failed:", uploadError);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "写真のアップロードに失敗しました" },
    };
  }

  // DBに登録
  const { error: dbError } = await adminSupabase.from("cast_photos").insert({
    id: photoId,
    cast_id: castId,
    storage_path: storagePath,
    display_order: nextOrder,
    caption: caption || null,
  });

  if (dbError) {
    console.error("[CastPhotos] DB insert failed:", dbError);
    // ストレージからも削除（ロールバック）
    await adminSupabase.storage.from(BUCKET_NAME).remove([storagePath]);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "写真情報の保存に失敗しました" },
    };
  }

  const publicUrl = adminSupabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath).data.publicUrl;

  // 監査ログ
  await writeAuditLog({
    action: "CAST_PHOTO_UPLOAD",
    targetType: "cast_photos",
    targetId: photoId,
    success: true,
    metadata: buildAuditMetadata({
      cast_id: castId,
      storage_path: storagePath,
    }),
    actorStaffId: user.id,
  });

  // キャッシュを無効化
  revalidatePath("/subscribe/cast");
  revalidatePath(`/admin/staff/${castId}/photos`);
  revalidatePath("/my-photos");

  return { ok: true, data: { photoId, url: publicUrl } };
}

// =====================================
// 写真削除（Admin/Supervisor/本人）
// =====================================

export type DeleteCastPhotoResult = Result<void>;

export async function deleteCastPhoto(photoId: string): Promise<DeleteCastPhotoResult> {
  const parsed = deleteCastPhotoSchema.safeParse({ photoId });
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const supabase = await createServerSupabaseClient();
  const adminSupabase = createAdminSupabaseClient();

  // 認証チェック
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  // 写真情報を取得
  const { data: photo } = await adminSupabase
    .from("cast_photos")
    .select("id, cast_id, storage_path")
    .eq("id", photoId)
    .single();

  if (!photo) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "写真が見つかりません" },
    };
  }

  // 権限チェック
  const { data: staffProfile } = await adminSupabase
    .from("staff_profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!staffProfile) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "スタッフ権限がありません" },
    };
  }

  const isAdminOrSupervisor = ["admin", "supervisor"].includes(staffProfile.role);
  const isSelf = staffProfile.id === photo.cast_id;

  if (!isAdminOrSupervisor && !isSelf) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  // ストレージから削除
  const { error: storageError } = await adminSupabase.storage
    .from(BUCKET_NAME)
    .remove([photo.storage_path]);

  if (storageError) {
    console.error("[CastPhotos] Storage delete failed:", storageError);
  }

  // DBから削除（物理削除）
  const { error: dbError } = await adminSupabase
    .from("cast_photos")
    .delete()
    .eq("id", photoId);

  if (dbError) {
    console.error("[CastPhotos] DB delete failed:", dbError);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "写真の削除に失敗しました" },
    };
  }

  // 監査ログ
  await writeAuditLog({
    action: "CAST_PHOTO_DELETE",
    targetType: "cast_photos",
    targetId: photoId,
    success: true,
    metadata: buildAuditMetadata({
      cast_id: photo.cast_id,
      storage_path: photo.storage_path,
    }),
    actorStaffId: user.id,
  });

  // キャッシュを無効化
  revalidatePath("/subscribe/cast");
  revalidatePath(`/admin/staff/${photo.cast_id}/photos`);
  revalidatePath("/my-photos");

  return { ok: true, data: undefined };
}

// =====================================
// 並び順変更（Admin/Supervisor/本人）
// =====================================

export type ReorderCastPhotosResult = Result<void>;

export async function reorderCastPhotos(
  castId: string,
  photoIds: string[]
): Promise<ReorderCastPhotosResult> {
  const parsed = reorderCastPhotosSchema.safeParse({ castId, photoIds });
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const supabase = await createServerSupabaseClient();
  const adminSupabase = createAdminSupabaseClient();

  // 認証チェック
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  // 権限チェック
  const { data: staffProfile } = await adminSupabase
    .from("staff_profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!staffProfile) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "スタッフ権限がありません" },
    };
  }

  const isAdminOrSupervisor = ["admin", "supervisor"].includes(staffProfile.role);
  const isSelf = staffProfile.id === castId;

  if (!isAdminOrSupervisor && !isSelf) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  // 各写真の順序を更新
  for (let i = 0; i < photoIds.length; i++) {
    const { error } = await adminSupabase
      .from("cast_photos")
      .update({ display_order: i })
      .eq("id", photoIds[i])
      .eq("cast_id", castId);

    if (error) {
      console.error("[CastPhotos] Reorder failed:", error);
      return {
        ok: false,
        error: { code: "UNKNOWN", message: "並び順の更新に失敗しました" },
      };
    }
  }

  // 監査ログ
  await writeAuditLog({
    action: "CAST_PHOTO_REORDER",
    targetType: "cast_photos",
    targetId: castId,
    success: true,
    metadata: buildAuditMetadata({
      cast_id: castId,
      new_order: photoIds,
    }),
    actorStaffId: user.id,
  });

  // キャッシュを無効化
  revalidatePath("/subscribe/cast");
  revalidatePath(`/admin/staff/${castId}/photos`);
  revalidatePath("/my-photos");

  return { ok: true, data: undefined };
}

// =====================================
// キャプション更新（Admin/Supervisor/本人）
// =====================================

export type UpdateCaptionResult = Result<void>;

export async function updateCaption(
  photoId: string,
  caption: string | null
): Promise<UpdateCaptionResult> {
  const parsed = updateCaptionSchema.safeParse({ photoId, caption });
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
    };
  }

  const supabase = await createServerSupabaseClient();
  const adminSupabase = createAdminSupabaseClient();

  // 認証チェック
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "ログインが必要です" },
    };
  }

  // 写真情報を取得
  const { data: photo } = await adminSupabase
    .from("cast_photos")
    .select("id, cast_id")
    .eq("id", photoId)
    .single();

  if (!photo) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "写真が見つかりません" },
    };
  }

  // 権限チェック
  const { data: staffProfile } = await adminSupabase
    .from("staff_profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!staffProfile) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "スタッフ権限がありません" },
    };
  }

  const isAdminOrSupervisor = ["admin", "supervisor"].includes(staffProfile.role);
  const isSelf = staffProfile.id === photo.cast_id;

  if (!isAdminOrSupervisor && !isSelf) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  // キャプションを更新
  const { error } = await adminSupabase
    .from("cast_photos")
    .update({ caption })
    .eq("id", photoId);

  if (error) {
    console.error("[CastPhotos] Caption update failed:", error);
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "キャプションの更新に失敗しました" },
    };
  }

  return { ok: true, data: undefined };
}
