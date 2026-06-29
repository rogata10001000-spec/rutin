"use client";

import { useState, useCallback, useRef } from "react";
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

type SortablePhotoProps = {
  photo: CastPhoto;
  onDelete: (id: string) => void;
  onCaptionChange: (id: string, caption: string | null) => void;
  isDeleting: boolean;
};

function SortablePhoto({
  photo,
  onDelete,
  onCaptionChange,
  isDeleting,
}: SortablePhotoProps) {
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
        disabled={isDeleting}
        aria-label="写真を削除"
        className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-lg bg-red-500 text-white opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-50 sm:size-8 sm:opacity-0 sm:group-hover:opacity-100"
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

export function PhotoEditor({
  castId,
  castName,
  initialPhotos,
  maxPhotos = 5,
}: PhotoEditorProps) {
  const [photos, setPhotos] = useState<CastPhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // マウスは小移動で即ドラッグ。タッチは長押し(200ms)で持ち上げ＋移動許容を設け、
  // 通常スクロールと両立させる（グローバルルール: タッチDnDは長押しで持ち上げ）。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const showMessage = (msg: string, isError: boolean) => {
    if (isError) {
      setError(msg);
      setSuccess(null);
    } else {
      setSuccess(msg);
      setError(null);
    }
    setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 3000);
  };

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (photos.length >= maxPhotos) {
        showMessage(`写真は最大${maxPhotos}枚までです`, true);
        return;
      }

      setUploading(true);
      setError(null);

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
        showMessage("写真をアップロードしました", false);
      } else {
        showMessage(result.error.message, true);
      }

      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [castId, photos.length, maxPhotos]
  );

  const handleDelete = useCallback(async (photoId: string) => {
    setDeleting(photoId);

    const result = await deleteCastPhoto(photoId);

    if (result.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      showMessage("写真を削除しました", false);
    } else {
      showMessage(result.error.message, true);
    }

    setDeleting(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        setPhotos((prev) => {
          const oldIndex = prev.findIndex((p) => p.id === active.id);
          const newIndex = prev.findIndex((p) => p.id === over.id);
          const newPhotos = arrayMove(prev, oldIndex, newIndex);

          // 非同期で順序を保存
          reorderCastPhotos(
            castId,
            newPhotos.map((p) => p.id)
          ).then((result) => {
            if (!result.ok) {
              showMessage("並び順の保存に失敗しました", true);
            }
          });

          return newPhotos;
        });
      }
    },
    [castId]
  );

  const handleCaptionChange = useCallback(
    async (photoId: string, caption: string | null) => {
      const result = await updateCaption(photoId, caption);

      if (result.ok) {
        setPhotos((prev) =>
          prev.map((p) => (p.id === photoId ? { ...p, caption } : p))
        );
      } else {
        showMessage(result.error.message, true);
      }
    },
    []
  );

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900">
            {castName}の写真管理
          </h2>
          <p className="text-sm text-stone-500">
            最大{maxPhotos}枚まで登録できます（現在 {photos.length}枚）
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            id="photo-upload"
          />
          <label
            htmlFor="photo-upload"
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              photos.length >= maxPhotos || uploading
                ? "cursor-not-allowed bg-stone-100 text-stone-400"
                : "bg-primary text-white hover:bg-primary-dark"
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
      {photos.length === 0 ? (
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
          <SortableContext
            items={photos.map((p) => p.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo) => (
                <SortablePhoto
                  key={photo.id}
                  photo={photo}
                  onDelete={(id) => setPendingDeleteId(id)}
                  onCaptionChange={handleCaptionChange}
                  isDeleting={deleting === photo.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 説明 */}
      <div className="rounded-lg bg-stone-50 p-4 text-sm text-stone-600">
        <p className="font-medium">使い方</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>ドラッグ&ドロップ（スマホは長押しで持ち上げ）で写真の順序を変更できます</li>
          <li>写真をクリックするとキャプションを編集できます</li>
          <li>1枚目の写真がメイト一覧のサムネイルになります</li>
          <li>対応形式: JPEG、PNG、WebP（最大5MB）</li>
        </ul>
      </div>

      {/* 削除確認（誤タップ防止・不可逆操作） */}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="この写真を削除しますか？"
        description="削除すると元に戻せません。メイト一覧やプロフィールからも表示されなくなります。"
        confirmLabel="削除する"
        variant="danger"
        loading={deleting !== null}
        onConfirm={() => {
          const id = pendingDeleteId;
          setPendingDeleteId(null);
          if (id) void handleDelete(id);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

export default PhotoEditor;
