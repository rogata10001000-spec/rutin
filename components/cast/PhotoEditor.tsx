"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { compressImageFile, MAX_UPLOAD_BYTES } from "@/lib/image-compress";
import {
  uploadCastPhoto,
  deleteCastPhoto,
  reorderCastPhotos,
  updateCaption,
  type CastPhoto,
} from "@/actions/cast-photos";

type PhotoEditorProps = {
  castId: string;
  castName: string;
  initialPhotos: CastPhoto[];
  maxPhotos?: number;
};

/** アップロード中／失敗した写真。確定するまで grid の末尾に仮のタイルとして並べる。 */
type PendingUpload = {
  tempId: string;
  previewUrl: string;
  file: File;
  status: "uploading" | "error";
  message?: string;
};

type SortablePhotoProps = {
  photo: CastPhoto;
  onDelete: (id: string) => void;
  onCaptionChange: (id: string, caption: string | null) => void;
};

function SortablePhoto({ photo, onDelete, onCaptionChange }: SortablePhotoProps) {
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionValue, setCaptionValue] = useState(photo.caption || "");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSaveCaption = () => {
    onCaptionChange(photo.id, captionValue || null);
    setEditingCaption(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative aspect-square overflow-hidden rounded-xl border border-stone-200 bg-stone-50"
    >
      <Image
        src={photo.url}
        alt={photo.caption || "メイト写真"}
        fill
        unoptimized
        className="object-cover"
        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
      />

      {/* ドラッグハンドル */}
      <button
        {...attributes}
        {...listeners}
        aria-label="ドラッグして並べ替え（長押しで持ち上げ）"
        className="absolute left-2 top-2 flex size-9 touch-none cursor-grab items-center justify-center rounded-lg bg-black/50 text-white opacity-100 transition-opacity active:cursor-grabbing sm:size-8 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <span className="material-symbols-outlined text-[20px]">drag_indicator</span>
      </button>

      {/* 削除ボタン */}
      <button
        onClick={() => onDelete(photo.id)}
        aria-label="写真を削除"
        className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-lg bg-red-500 text-white opacity-100 transition-opacity hover:bg-red-600 sm:size-8 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <span className="material-symbols-outlined text-[20px]">delete</span>
      </button>

      {/* キャプション編集 */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
        {editingCaption ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={captionValue}
              onChange={(e) => setCaptionValue(e.target.value)}
              maxLength={200}
              className="flex-1 rounded bg-white/90 px-2 py-1 text-sm text-stone-900"
              placeholder="キャプションを入力..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCaption();
                if (e.key === "Escape") setEditingCaption(false);
              }}
            />
            <button
              onClick={handleSaveCaption}
              className="rounded bg-primary px-2 py-1 text-sm text-white"
            >
              保存
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingCaption(true)}
            className="w-full text-left text-sm text-white/90 hover:text-white"
          >
            {photo.caption || "キャプションを追加..."}
          </button>
        )}
      </div>
    </div>
  );
}

/** アップロード中／失敗タイル。選んだ瞬間にプレビューが並ぶので「押したのに何も起きない」時間をなくす。 */
function PendingPhotoTile({
  pending,
  onRetry,
  onDismiss,
}: {
  pending: PendingUpload;
  onRetry: (tempId: string) => void;
  onDismiss: (tempId: string) => void;
}) {
  const failed = pending.status === "error";

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
      {/* eslint-disable-next-line @next/next/no-img-element -- ローカルの blob: プレビュー（最適化対象外） */}
      <img
        src={pending.previewUrl}
        alt=""
        className="absolute inset-0 size-full object-cover opacity-60"
      />
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center ${
          failed ? "bg-red-900/60" : "bg-stone-900/40"
        }`}
      >
        {failed ? (
          <>
            <p className="text-xs font-medium leading-snug text-white">
              {pending.message ?? "アップロードできませんでした"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onRetry(pending.tempId)}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-100"
              >
                再試行
              </button>
              <button
                onClick={() => onDismiss(pending.tempId)}
                className="rounded-lg border border-white/60 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
              >
                取り消す
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined animate-spin text-[28px] text-white">
              progress_activity
            </span>
            <p className="text-xs font-medium text-white">アップロード中…</p>
          </>
        )}
      </div>
    </div>
  );
}

export function PhotoEditor({
  castId,
  castName,
  initialPhotos,
  maxPhotos = 5,
}: PhotoEditorProps) {
  const [photos, setPhotos] = useState<CastPhoto[]>(initialPhotos);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  const uploading = pendingUploads.some((p) => p.status === "uploading");
  const totalCount = photos.length + pendingUploads.length;
  const remainingSlots = Math.max(0, maxPhotos - totalCount);

  // マウスは小移動で即ドラッグ。タッチは長押し(200ms)で持ち上げ＋移動許容を設け、
  // 通常スクロールと両立させる（グローバルルール: タッチDnDは長押しで持ち上げ）。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // アンマウント時にタイマーとプレビューURLを解放する（メモリリーク防止）。
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const showMessage = useCallback((msg: string, isError: boolean) => {
    if (isError) {
      setError(msg);
      setSuccess(null);
    } else {
      setSuccess(msg);
      setError(null);
    }
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 3000);
  }, []);

  const releasePreview = useCallback((url: string) => {
    if (previewUrlsRef.current.delete(url)) URL.revokeObjectURL(url);
  }, []);

  /** 1件を実際に送信する。成功したら仮タイルを実データに置き換え、失敗したら仮タイルを失敗状態にする。 */
  const sendUpload = useCallback(
    async (tempId: string, file: File) => {
      const formData = new FormData();
      formData.append("castId", castId);
      formData.append("file", file);

      const result = await uploadCastPhoto(formData);

      if (result.ok) {
        setPhotos((prev) => [
          ...prev,
          {
            id: result.data.photoId,
            url: result.data.url,
            caption: null,
            displayOrder: prev.length,
          },
        ]);
        setPendingUploads((prev) => {
          const target = prev.find((p) => p.tempId === tempId);
          if (target) releasePreview(target.previewUrl);
          return prev.filter((p) => p.tempId !== tempId);
        });
      } else {
        setPendingUploads((prev) =>
          prev.map((p) =>
            p.tempId === tempId
              ? { ...p, status: "error", message: result.error.message }
              : p
          )
        );
      }
    },
    [castId, releasePreview]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      // 同じファイルを選び直せるよう、読み取り後すぐに input を空にする。
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (selected.length === 0) return;

      if (remainingSlots === 0) {
        showMessage(`写真は最大${maxPhotos}枚までです`, true);
        return;
      }

      const accepted = selected.slice(0, remainingSlots);
      if (selected.length > accepted.length) {
        showMessage(
          `あと${remainingSlots}枚まで追加できます。先頭の${accepted.length}枚をアップロードします`,
          true
        );
      }

      // 上限を超えないよう1件ずつ順番に送る（同時送信だと枚数チェックをすり抜ける）。
      for (const original of accepted) {
        const tempId = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(original);
        previewUrlsRef.current.add(previewUrl);

        // 選んだ瞬間にタイルを出す（＝待ち時間が「無反応」にならない）。
        setPendingUploads((prev) => [
          ...prev,
          { tempId, previewUrl, file: original, status: "uploading" },
        ]);

        // 送信前に縮小・再圧縮して送信時間を短くする。
        const file = await compressImageFile(original);

        if (file.size > MAX_UPLOAD_BYTES) {
          setPendingUploads((prev) =>
            prev.map((p) =>
              p.tempId === tempId
                ? {
                    ...p,
                    status: "error",
                    message: "サイズが大きすぎます。5MB以下の画像を選んでください",
                  }
                : p
            )
          );
          continue;
        }

        setPendingUploads((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, file } : p))
        );

        await sendUpload(tempId, file);
      }
    },
    [maxPhotos, remainingSlots, sendUpload, showMessage]
  );

  const handleRetryUpload = useCallback(
    (tempId: string) => {
      const target = pendingUploads.find((p) => p.tempId === tempId);
      if (!target) return;
      setPendingUploads((prev) =>
        prev.map((p) =>
          p.tempId === tempId ? { ...p, status: "uploading", message: undefined } : p
        )
      );
      void sendUpload(tempId, target.file);
    },
    [pendingUploads, sendUpload]
  );

  const handleDismissUpload = useCallback(
    (tempId: string) => {
      setPendingUploads((prev) => {
        const target = prev.find((p) => p.tempId === tempId);
        if (target) releasePreview(target.previewUrl);
        return prev.filter((p) => p.tempId !== tempId);
      });
    },
    [releasePreview]
  );

  /** 楽観的削除。すぐタイルを消し、サーバーが失敗したら元の位置へ戻す。 */
  const handleDelete = useCallback(
    (photoId: string) => {
      const index = photos.findIndex((p) => p.id === photoId);
      if (index === -1) return;
      const removed = photos[index];

      setPhotos((prev) => prev.filter((p) => p.id !== photoId));

      void deleteCastPhoto(photoId).then((result) => {
        if (!result.ok) {
          setPhotos((prev) => {
            if (prev.some((p) => p.id === photoId)) return prev;
            const restored = [...prev];
            restored.splice(Math.min(index, restored.length), 0, removed);
            return restored;
          });
          showMessage(result.error.message, true);
        }
      });
    },
    [photos, showMessage]
  );

  /** 楽観的並び替え。失敗したら元の並びに戻す（表示だけ変わって保存されていない状態を残さない）。 */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = photos.findIndex((p) => p.id === active.id);
      const newIndex = photos.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const previous = photos;
      const reordered = arrayMove(photos, oldIndex, newIndex);
      setPhotos(reordered);

      void reorderCastPhotos(
        castId,
        reordered.map((p) => p.id)
      ).then((result) => {
        if (!result.ok) {
          setPhotos(previous);
          showMessage("並び順を保存できませんでした。もう一度お試しください", true);
        }
      });
    },
    [castId, photos, showMessage]
  );

  /** 楽観的キャプション更新。失敗したら元の文言に戻す。 */
  const handleCaptionChange = useCallback(
    (photoId: string, caption: string | null) => {
      let previousCaption: string | null = null;
      setPhotos((prev) =>
        prev.map((p) => {
          if (p.id !== photoId) return p;
          previousCaption = p.caption;
          return { ...p, caption };
        })
      );

      void updateCaption(photoId, caption).then((result) => {
        if (!result.ok) {
          setPhotos((prev) =>
            prev.map((p) => (p.id === photoId ? { ...p, caption: previousCaption } : p))
          );
          showMessage(result.error.message, true);
        }
      });
    },
    [showMessage]
  );

  const addDisabled = remainingSlots === 0 || uploading;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900">
            {castName}の写真管理
          </h2>
          <p className="text-sm text-stone-500">
            最大{maxPhotos}枚まで登録できます（現在 {totalCount}枚）
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={addDisabled}
            onChange={handleFileSelect}
            className="hidden"
            id="photo-upload"
          />
          <label
            htmlFor="photo-upload"
            aria-disabled={addDisabled}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              addDisabled
                ? "cursor-not-allowed bg-stone-100 text-stone-400"
                : "cursor-pointer bg-primary text-white hover:bg-primary-dark"
            }`}
          >
            {uploading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[18px]">
                  progress_activity
                </span>
                アップロード中...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">
                  add_photo_alternate
                </span>
                写真を追加
              </>
            )}
          </label>
        </div>
      </div>

      {/* メッセージ */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-600">
          {success}
        </div>
      )}

      {/* 写真グリッド */}
      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-300 p-12 text-stone-500">
          <span className="material-symbols-outlined mb-2 text-[48px]">
            photo_library
          </span>
          <p>まだ写真がありません</p>
          <p className="text-sm">上のボタンから写真を追加してください</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <SortableContext
              items={photos.map((p) => p.id)}
              strategy={rectSortingStrategy}
            >
              {photos.map((photo) => (
                <SortablePhoto
                  key={photo.id}
                  photo={photo}
                  onDelete={(id) => setPendingDeleteId(id)}
                  onCaptionChange={handleCaptionChange}
                />
              ))}
            </SortableContext>
            {pendingUploads.map((pending) => (
              <PendingPhotoTile
                key={pending.tempId}
                pending={pending}
                onRetry={handleRetryUpload}
                onDismiss={handleDismissUpload}
              />
            ))}
          </div>
        </DndContext>
      )}

      {/* 説明 */}
      <div className="rounded-lg bg-stone-50 p-4 text-sm text-stone-600">
        <p className="font-medium">使い方</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>ドラッグ&ドロップ（スマホは長押しで持ち上げ）で写真の順序を変更できます</li>
          <li>写真をクリックするとキャプションを編集できます</li>
          <li>1枚目の写真がメイト一覧のサムネイルになります</li>
          <li>対応形式: JPEG、PNG、WebP（最大5MB・複数まとめて選べます）</li>
        </ul>
      </div>

      {/* 削除確認（誤タップ防止・不可逆操作） */}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="この写真を削除しますか？"
        description="削除すると元に戻せません。メイト一覧やプロフィールからも表示されなくなります。"
        confirmLabel="削除する"
        variant="danger"
        onConfirm={() => {
          const id = pendingDeleteId;
          setPendingDeleteId(null);
          if (id) handleDelete(id);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

export default PhotoEditor;
