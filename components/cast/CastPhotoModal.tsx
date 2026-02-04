"use client";

import { useEffect, useCallback, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Keyboard } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

export type CastPhotoModalPhoto = {
  id: string;
  url: string;
  caption: string | null;
};

type CastPhotoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  photos: CastPhotoModalPhoto[];
  castName: string;
  initialIndex?: number;
};

export function CastPhotoModal({
  isOpen,
  onClose,
  photos,
  castName,
  initialIndex = 0,
}: CastPhotoModalProps) {
  const [swiperInstance, setSwiperInstance] = useState<SwiperType | null>(null);

  // ESCキーで閉じる
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  // モーダルが開いたときにスライドをリセット
  useEffect(() => {
    if (isOpen && swiperInstance) {
      swiperInstance.slideTo(initialIndex, 0);
    }
  }, [isOpen, initialIndex, swiperInstance]);

  if (!isOpen || photos.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${castName}の写真`}
      className="fixed inset-0 z-[100] flex items-center justify-center"
    >
      {/* 背景オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 閉じるボタン */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        aria-label="閉じる"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>
          close
        </span>
      </button>

      {/* キャスト名 */}
      <div className="absolute left-4 top-4 z-10 rounded-lg bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
        {castName}
      </div>

      {/* カルーセル */}
      <div className="relative z-10 w-full max-w-3xl px-4">
        <Swiper
          modules={[Navigation, Pagination, Keyboard]}
          navigation={{
            nextEl: ".swiper-button-next-custom",
            prevEl: ".swiper-button-prev-custom",
          }}
          pagination={{
            clickable: true,
            bulletClass: "swiper-pagination-bullet !bg-white/50",
            bulletActiveClass: "!bg-primary",
          }}
          keyboard={{ enabled: true }}
          loop={photos.length > 1}
          initialSlide={initialIndex}
          onSwiper={setSwiperInstance}
          className="w-full"
        >
          {photos.map((photo, index) => (
            <SwiperSlide key={photo.id}>
              <div className="flex flex-col items-center">
                <div className="relative aspect-[3/4] w-full max-h-[70vh] overflow-hidden rounded-2xl bg-black/20">
                  <img
                    src={photo.url}
                    alt={photo.caption || `${castName}の写真 ${index + 1}`}
                    className="size-full object-contain"
                    loading={index === initialIndex ? "eager" : "lazy"}
                  />
                </div>
                {photo.caption && (
                  <p className="mt-4 max-w-md text-center text-sm text-white/90">
                    {photo.caption}
                  </p>
                )}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        {/* カスタムナビゲーションボタン */}
        {photos.length > 1 && (
          <>
            <button
              className="swiper-button-prev-custom absolute left-0 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 md:-left-16"
              aria-label="前の写真"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>
                chevron_left
              </span>
            </button>
            <button
              className="swiper-button-next-custom absolute right-0 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 md:-right-16"
              aria-label="次の写真"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>
                chevron_right
              </span>
            </button>
          </>
        )}
      </div>

      {/* 写真カウンター */}
      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-black/50 px-3 py-1.5 text-sm text-white backdrop-blur-sm">
        <span id="current-slide">1</span> / {photos.length}
      </div>
    </div>
  );
}

export default CastPhotoModal;
