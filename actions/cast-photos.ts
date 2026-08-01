"use server";

import { logger } from "@/lib/logger";
import { after } from "next/server";
import {
  getCastPhotosSchema,
  uploadCastPhotoSchema,
  deleteCastPhotoSchema,
  reorderCastPhotosSchema,
  updateCaptionSchema,
} from "@/schemas/cast-photos";
import { Result, toZodErrorMessage } from "./types";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import { writeAuditLog, buildAuditMetadata } from "@/lib/audit";

const BUCKET_NAME = "cast-photos";
const MAX_PHOTOS_PER_CAST = 5;

// 写真を表示する画面（/my-photos・/admin/staff/[id]/photos・/subscribe/cast・/admin/cast-photos）は
// すべて force-dynamic のため、ISR キャッシュが存在せず revalidatePath は何も消さない。
// それでも Server Action 内で呼ぶと「現在のページを再レンダリングした RSC ペイロード」が
// レスポンスに載り、体感速度だけが落ちる（クライアントは楽観的更新済みで結果を捨てる）。
// そのため、この機能では意図的に revalidatePath を呼ばない。

// この操作を行えるスタッフか（本人 or admin/SV）。
// 認証・在籍(active)判定は getCurrentStaff に集約し、各関数での重複実装を排除する。
function canManageCast(staff: { id: string; role: string }, castId: string): boolean {
  return staff.role === "admin" || staff.role === "supervisor" || staff.id === castId;
}

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

  try {
    const supabase = createAdminSupabaseClient();

    const { data: photos, error } = await supabase
      .from("cast_photos")
      .select("id, storage_path, caption, display_order")
      .eq("cast_id", castId)
      .eq("active", true)
      .order("display_order");

    if (error) {
      logger.error("castPhotos: failed to fetch photos", { error: error.message });
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
  } catch (error) {
    logger.error("castPhotos: unexpected error fetching photos", { error: error instanceof Error ? error.message : String(error) });
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "写真の取得に失敗しました" },
    };
  }
}

// =====================================
// 複数メイトの写真をまとめて取得（一覧用）
// =====================================

export type GetCastPhotosForCastsResult = Result<{
  photosByCastId: Record<string, CastPhoto[]>;
}>;

/**
 * メイトIDの配列に対する写真を1クエリで取得する。
 * 一覧画面で getCastPhotos をメイトごとに呼ぶと、人数ぶんのクエリ（N+1）になる。
 */
export async function getCastPhotosForCasts(
  castIds: string[]
): Promise<GetCastPhotosForCastsResult> {
  if (castIds.length === 0) {
    return { ok: true, data: { photosByCastId: {} } };
  }

  try {
    const supabase = createAdminSupabaseClient();

    const { data: photos, error } = await supabase
      .from("cast_photos")
      .select("id, cast_id, storage_path, caption, display_order")
      .in("cast_id", castIds)
      .eq("active", true)
      .order("display_order");

    if (error) {
      logger.error("castPhotos: failed to fetch photos in bulk", { error: error.message });
      return { ok: false, error: { code: "UNKNOWN", message: "写真の取得に失敗しました" } };
    }

    const photosByCastId: Record<string, CastPhoto[]> = {};
    for (const p of photos ?? []) {
      const entry: CastPhoto = {
        id: p.id,
        url: supabase.storage.from(BUCKET_NAME).getPublicUrl(p.storage_path).data.publicUrl,
        caption: p.caption,
        displayOrder: p.display_order,
      };
      (photosByCastId[p.cast_id] ??= []).push(entry);
    }

    return { ok: true, data: { photosByCastId } };
  } catch (error) {
    logger.error("castPhotos: unexpected error fetching photos in bulk", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: { code: "UNKNOWN", message: "写真の取得に失敗しました" } };
  }
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
  const captionValue = formData.get("caption");
  const caption = typeof captionValue === "string" && captionValue.trim() !== ""
    ? captionValue.trim()
    : undefined;
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

  const adminSupabase = createAdminSupabaseClient();

  // 認証・枚数制限・表示順は互いに独立なので並列で取得する（アップロード前の往復を1回分に圧縮）。
  const [staff, limitResult, existingPhotosResult] = await Promise.all([
    getCurrentStaff(),
    adminSupabase.rpc("check_cast_photos_limit", { p_cast_id: castId }),
    adminSupabase
      .from("cast_photos")
      .select("display_order")
      .eq("cast_id", castId)
      .eq("active", true)
      .order("display_order", { ascending: false })
      .limit(1),
  ]);

  // 認証・在籍・権限（本人 or admin/SV）チェック
  if (!staff) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です" } };
  }
  if (!canManageCast(staff, castId)) {
    return { ok: false, error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" } };
  }

  // 5枚制限チェック
  if (!limitResult.data) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: `写真は最大${MAX_PHOTOS_PER_CAST}枚までです` },
    };
  }

  const nextOrder =
    displayOrder ?? ((existingPhotosResult.data?.[0]?.display_order ?? -1) + 1);

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
    logger.error("castPhotos: storage upload failed", { error: uploadError.message });
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
    logger.error("castPhotos: db insert failed", { error: dbError.message });
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

  // 監査ログはユーザーが待つ必要がないので応答後に書く（after は完了まで保証される）。
  const actorStaffId = staff.id;
  after(async () => {
    try {
      await writeAuditLog({
        action: "CAST_PHOTO_UPLOAD",
        targetType: "cast_photos",
        targetId: photoId,
        success: true,
        metadata: buildAuditMetadata({
          cast_id: castId,
          storage_path: storagePath,
        }),
        actorStaffId,
      });
    } catch (error) {
      logger.error("castPhotos: audit log failed after upload", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

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

  const adminSupabase = createAdminSupabaseClient();

  // 認証と対象写真の取得は独立なので並列で行う。
  const [staff, photoResult] = await Promise.all([
    getCurrentStaff(),
    adminSupabase
      .from("cast_photos")
      .select("id, cast_id, storage_path")
      .eq("id", photoId)
      .single(),
  ]);

  if (!staff) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です" } };
  }

  const photo = photoResult.data;
  if (!photo) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "写真が見つかりません" },
    };
  }

  // 権限チェック（本人 or admin/SV）
  if (!canManageCast(staff, photo.cast_id)) {
    return { ok: false, error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" } };
  }

  // DBを先に削除する。逆順（ストレージ先行）だと、DB削除に失敗したときに
  // 実体のない行が残り、一覧に壊れた画像が永久に表示される。
  const { error: dbError } = await adminSupabase
    .from("cast_photos")
    .delete()
    .eq("id", photoId);

  if (dbError) {
    logger.error("castPhotos: db delete failed", { error: dbError.message });
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "写真の削除に失敗しました" },
    };
  }

  // 実体の削除と監査ログはユーザーの待ち時間に含めない（行が消えた時点で画面上は削除済み）。
  const storagePath = photo.storage_path;
  const photoCastId = photo.cast_id;
  const actorStaffId = staff.id;
  after(async () => {
    try {
      const { error: storageError } = await adminSupabase.storage
        .from(BUCKET_NAME)
        .remove([storagePath]);
      if (storageError) {
        logger.error("castPhotos: storage delete failed", { error: storageError.message });
      }
      await writeAuditLog({
        action: "CAST_PHOTO_DELETE",
        targetType: "cast_photos",
        targetId: photoId,
        success: true,
        metadata: buildAuditMetadata({
          cast_id: photoCastId,
          storage_path: storagePath,
        }),
        actorStaffId,
      });
    } catch (error) {
      logger.error("castPhotos: post-delete cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

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

  const adminSupabase = createAdminSupabaseClient();

  // 認証・在籍・権限（本人 or admin/SV）チェック
  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です" } };
  }
  if (!canManageCast(staff, castId)) {
    return { ok: false, error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" } };
  }

  // 各写真の順序を更新（互いに独立なので並列。直列だと枚数ぶん往復して並び替えが重くなる）。
  const updates = await Promise.all(
    photoIds.map((id, index) =>
      adminSupabase
        .from("cast_photos")
        .update({ display_order: index })
        .eq("id", id)
        .eq("cast_id", castId)
    )
  );

  const failed = updates.find((r) => r.error);
  if (failed?.error) {
    logger.error("castPhotos: reorder failed", { error: failed.error.message });
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "並び順の更新に失敗しました" },
    };
  }

  // 監査ログは応答後に書く（クライアントは楽観的に並べ替え済み）。
  const actorStaffId = staff.id;
  after(async () => {
    try {
      await writeAuditLog({
        action: "CAST_PHOTO_REORDER",
        targetType: "cast_photos",
        targetId: castId,
        success: true,
        metadata: buildAuditMetadata({
          cast_id: castId,
          new_order: photoIds,
        }),
        actorStaffId,
      });
    } catch (error) {
      logger.error("castPhotos: audit log failed after reorder", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

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

  const adminSupabase = createAdminSupabaseClient();

  // 認証と対象写真の取得は独立なので並列で行う。
  const [staff, photoResult] = await Promise.all([
    getCurrentStaff(),
    adminSupabase.from("cast_photos").select("id, cast_id").eq("id", photoId).single(),
  ]);

  if (!staff) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です" } };
  }

  const photo = photoResult.data;
  if (!photo) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "写真が見つかりません" },
    };
  }

  // 権限チェック（本人 or admin/SV）
  if (!canManageCast(staff, photo.cast_id)) {
    return { ok: false, error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" } };
  }

  // キャプションを更新
  const { error } = await adminSupabase
    .from("cast_photos")
    .update({ caption })
    .eq("id", photoId);

  if (error) {
    logger.error("castPhotos: caption update failed", { error: error.message });
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "キャプションの更新に失敗しました" },
    };
  }

  return { ok: true, data: undefined };
}
