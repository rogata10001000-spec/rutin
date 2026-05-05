"use client";

import { useState } from "react";
import { CastPhotoModal, type CastPhotoModalPhoto } from "./CastPhotoModal";
import type { AvailableCast } from "@/actions/subscriptions";
import type { StaffGender } from "@/lib/supabase/types";

const formatYen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

const GENDER_LABEL: Record<StaffGender, string> = {
  female: "女性",
  male: "男性",
  other: "その他",
};

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

  return (
    <>
      <div className="flex flex-col gap-4 px-4">
        {casts.map((cast) => {
          const mainPhoto = cast.photos[0]?.url;
          const hasMultiplePhotos = cast.photos.length > 1;
          const genderText = cast.gender ? GENDER_LABEL[cast.gender] : null;

          return (
            <div
              key={cast.id}
              className="ios-shadow flex gap-4 rounded-2xl border border-warm-border/40 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {/* 写真エリア */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => handlePhotoClick(cast)}
                  className="group relative size-24 shrink-0 overflow-hidden rounded-2xl bg-warm-border/40 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  disabled={cast.photos.length === 0}
                  aria-label={
                    cast.photos.length === 0
                      ? `${cast.displayName}の写真は未登録`
                      : `${cast.displayName}の写真を見る`
                  }
                >
                  {mainPhoto ? (
                    <div
                      className="size-full bg-cover bg-center transition-transform group-hover:scale-105"
                      style={{ backgroundImage: `url(${mainPhoto})` }}
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[10px] font-medium text-[#6B5A51]">
                      No Photo
                    </div>
                  )}

                  {hasMultiplePhotos && (
                    <div className="absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white">
                      +{cast.photos.length - 1}
                    </div>
                  )}

                  {cast.photos.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                      <span className="material-symbols-outlined text-white opacity-0 transition-opacity group-hover:opacity-100">
                        photo_library
                      </span>
                    </div>
                  )}
                </button>
              </div>

              {/* 情報エリア */}
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    {genderText && (
                      <span className="mb-1 w-fit rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {genderText}
                      </span>
                    )}
                    <h3 className="text-base font-bold text-[#2D241E] dark:text-white">
                      {cast.displayName}
                    </h3>
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
                    className="rounded-full bg-primary px-4 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-primary-dark active:scale-95"
                  >
                    プランを見る
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
