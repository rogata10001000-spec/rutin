"use client";

import { useState } from "react";
import { CastPhotoModal, type CastPhotoModalPhoto } from "./CastPhotoModal";
import type { AvailableCast } from "@/actions/subscriptions";

const formatYen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

type CastListProps = {
  casts: AvailableCast[];
};

export function CastList({ casts }: CastListProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCast, setSelectedCast] = useState<AvailableCast | null>(null);
  const [initialPhotoIndex, setInitialPhotoIndex] = useState(0);

  const handlePhotoClick = (cast: AvailableCast, photoIndex: number = 0) => {
    if (cast.photos.length === 0) return;
    setSelectedCast(cast);
    setInitialPhotoIndex(photoIndex);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedCast(null);
  };

  // デフォルトのプロフィール画像
  const defaultImage =
    "https://lh3.googleusercontent.com/aida-public/AB6AXuANKsyPv-rHR3Vr5jMvw7BaA9JlE31s8799JJ2jhEaulob7EtUFJIT23ER67Ge5MMjI8_LG49BXGaTob4D6focNKadf7AKRNEQc33d-_cJ5QeR11ak5IBAeuOYYFqXfFVKke2QoCOtQmIvVo-mXTsBLdsPAUOBRxC1D7k8srzb2XJ7_SXCgzvUOpFdzF1ANI8dhBgc3uI1OCNMuk_PJW6UmlJkX1fdvfwejaj2C3zKSDg4ysYbxnd_TudN_GXnWrY6keo3XL9zW-Q";

  return (
    <>
      <div className="flex flex-col gap-4 px-4">
        {casts.map((cast) => {
          const mainPhoto = cast.photos[0]?.url || defaultImage;
          const hasMultiplePhotos = cast.photos.length > 1;

          return (
            <div
              key={cast.id}
              className="ios-shadow flex gap-4 rounded-2xl border border-warm-border/40 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {/* 写真エリア */}
              <div className="relative">
                <button
                  onClick={() => handlePhotoClick(cast)}
                  className="group relative size-24 shrink-0 overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  disabled={cast.photos.length === 0}
                >
                  <div
                    className="size-full bg-cover bg-center transition-transform group-hover:scale-105"
                    style={{ backgroundImage: `url(${mainPhoto})` }}
                  />
                  {/* 複数写真バッジ */}
                  {hasMultiplePhotos && (
                    <div className="absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white">
                      +{cast.photos.length - 1}
                    </div>
                  )}
                  {/* ホバーオーバーレイ */}
                  {cast.photos.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                      <span className="material-symbols-outlined text-white opacity-0 transition-opacity group-hover:opacity-100">
                        photo_library
                      </span>
                    </div>
                  )}
                </button>
                {/* オンラインステータス */}
                <div
                  className={`absolute -bottom-2 -right-2 size-4 rounded-full border-2 border-white dark:border-zinc-900 ${
                    cast.acceptingNewUsers ? "bg-green-500" : "bg-zinc-300"
                  }`}
                />
              </div>

              {/* 情報エリア */}
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    <span className="mb-1 w-fit rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      プレミアム
                    </span>
                    <h3 className="text-base font-bold text-[#2D241E] dark:text-white">
                      {cast.displayName}
                    </h3>
                  </div>
                  <div className="flex items-center gap-0.5 text-orange-400">
                    <span className="material-symbols-outlined fill-current text-[16px]">
                      star
                    </span>
                    <span className="text-xs font-bold text-[#2D241E] dark:text-zinc-300">
                      4.9
                    </span>
                  </div>
                </div>

                {cast.bio && (
                  <p className="line-clamp-2 text-xs leading-relaxed text-[#6B5A51] dark:text-zinc-400">
                    {cast.bio}
                  </p>
                )}

                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-bold text-primary">
                    {formatYen(cast.prices.light)}
                    <span className="ml-0.5 text-[10px] text-[#6B5A51]">/月〜</span>
                  </span>
                  <a
                    href={`/subscribe/plan?castId=${cast.id}`}
                    className={`rounded-full px-4 py-1.5 text-[12px] font-bold transition-colors active:scale-95 ${
                      cast.acceptingNewUsers
                        ? "bg-primary text-white hover:bg-primary-dark"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {cast.acceptingNewUsers ? "相談する" : "予約する"}
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 写真モーダル */}
      {selectedCast && (
        <CastPhotoModal
          isOpen={modalOpen}
          onClose={handleCloseModal}
          photos={selectedCast.photos as CastPhotoModalPhoto[]}
          castName={selectedCast.displayName}
          initialIndex={initialPhotoIndex}
        />
      )}
    </>
  );
}

export default CastList;
