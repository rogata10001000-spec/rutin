"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Keyboard } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

import type { AvailableCast } from "@/actions/subscriptions";
import type { StaffGender } from "@/lib/supabase/types";

const formatYen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

const GENDER_LABEL: Record<StaffGender, string> = {
  female: "女性",
  male: "男性",
  other: "その他",
};

type CastDetailModalProps = {
  cast: AvailableCast | null;
  isOpen: boolean;
  onClose: () => void;
};

export function CastDetailModal({ cast, isOpen, onClose }: CastDetailModalProps) {
  const [swiperInstance, setSwiperInstance] = useState<SwiperType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
      if (swiperInstance) {
        swiperInstance.slideTo(0, 0);
      }
    }
  }, [isOpen, cast?.id, swiperInstance]);

  if (!isOpen || !cast) return null;

  const photos = cast.photos;
  const hasPhotos = photos.length > 0;
  const hasMultiplePhotos = photos.length > 1;
  const genderText = cast.gender ? GENDER_LABEL[cast.gender] : null;
  const lowestPrice = Math.min(cast.prices.light, cast.prices.standard, cast.prices.premium);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${cast.displayName}の詳細`}
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl bg-background-light shadow-2xl sm:max-h-[90vh] sm:rounded-3xl">
        {/* 写真エリア */}
        <div className="relative aspect-[3/4] w-full bg-warm-border/40">
          {hasPhotos ? (
            <Swiper
              modules={[Navigation, Pagination, Keyboard]}
              navigation={
                hasMultiplePhotos
                  ? {
                      nextEl: ".cast-detail-next",
                      prevEl: ".cast-detail-prev",
                    }
                  : false
              }
              pagination={
                hasMultiplePhotos
                  ? {
                      clickable: true,
                      bulletClass: "swiper-pagination-bullet !bg-white/60",
                      bulletActiveClass: "!bg-primary",
                    }
                  : false
              }
              keyboard={{ enabled: true }}
              loop={hasMultiplePhotos}
              onSwiper={setSwiperInstance}
              onSlideChange={(s) => setActiveIndex(s.realIndex)}
              className="size-full"
            >
              {photos.map((photo, index) => (
                <SwiperSlide key={photo.id}>
                  <div className="relative size-full">
                    <Image
                      src={photo.url}
                      alt={photo.caption || `${cast.displayName}の写真 ${index + 1}`}
                      fill
                      unoptimized
                      sizes="(max-width: 480px) 100vw, 480px"
                      className="object-cover"
                      priority={index === 0}
                    />
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          ) : (
            <div className="flex size-full items-center justify-center text-sm font-medium text-[#6B5A51]">
              No Photo
            </div>
          )}

          {/* 閉じるボタン */}
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="absolute right-3 top-3 z-20 flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
              close
            </span>
          </button>

          {/* 写真ナビゲーション */}
          {hasMultiplePhotos && (
            <>
              <button
                type="button"
                aria-label="前の写真"
                className="cast-detail-prev absolute left-3 top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
                  chevron_left
                </span>
              </button>
              <button
                type="button"
                aria-label="次の写真"
                className="cast-detail-next absolute right-3 top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
                  chevron_right
                </span>
              </button>
              <div className="absolute bottom-3 right-3 z-20 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                {activeIndex + 1} / {photos.length}
              </div>
            </>
          )}
        </div>

        {/* 情報エリア */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-5">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {genderText && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                  {genderText}
                </span>
              )}
              {cast.age !== null && (
                <span className="rounded-full bg-warm-border/40 px-2.5 py-0.5 text-[11px] font-bold text-[#6B5A51]">
                  {cast.age}歳
                </span>
              )}
            </div>
            <h2 className="text-xl font-black leading-tight text-[#2D241E]">
              {cast.displayName}
            </h2>
            <p className="text-sm font-bold text-primary">
              {formatYen(lowestPrice)}
              <span className="ml-0.5 text-[11px] text-[#6B5A51]">/月〜</span>
            </p>
          </header>

          {cast.publicProfile ? (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-warm-border/40">
              <h3 className="text-xs font-bold tracking-wide text-[#6B5A51]">プロフィール</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#2D241E]">
                {cast.publicProfile}
              </p>
            </section>
          ) : (
            <p className="text-xs text-[#6B5A51]">
              プロフィール文は準備中です。
            </p>
          )}
        </div>

        {/* CTA固定フッター */}
        <div className="border-t border-warm-border/50 bg-white px-5 py-4">
          <a
            href={`/subscribe/plan?castId=${cast.id}`}
            className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-base font-bold text-white shadow-lg shadow-primary/30 transition-transform active:scale-95"
          >
            この伴走メイトでプランを見る
          </a>
        </div>
      </div>
    </div>
  );
}

export default CastDetailModal;
