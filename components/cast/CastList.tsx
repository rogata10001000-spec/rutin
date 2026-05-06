"use client";

import { useState } from "react";
import { CastDetailModal } from "./CastDetailModal";
import type { AvailableCast } from "@/actions/subscriptions";
import type { StaffGender } from "@/lib/supabase/types";

const GENDER_LABEL: Record<StaffGender, string> = {
  female: "女性",
  male: "男性",
  other: "その他",
};

type CastListProps = {
  casts: AvailableCast[];
};

export function CastList({ casts }: CastListProps) {
  const [selectedCast, setSelectedCast] = useState<AvailableCast | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2">
        {casts.map((cast) => {
          const mainPhoto = cast.photos[0]?.url;
          const photoCount = cast.photos.length;
          const genderText = cast.gender ? GENDER_LABEL[cast.gender] : null;

          return (
            <button
              key={cast.id}
              type="button"
              onClick={() => setSelectedCast(cast)}
              className="group relative flex aspect-[3/4] w-full overflow-hidden rounded-3xl bg-warm-border/40 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:aspect-[3/4]"
              aria-label={`${cast.displayName}の詳細を見る`}
            >
              {mainPhoto ? (
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.03]"
                  style={{ backgroundImage: `url(${mainPhoto})` }}
                />
              ) : (
                <div className="flex size-full items-center justify-center text-sm font-medium text-[#6B5A51]">
                  No Photo
                </div>
              )}

              {/* 上部: バッジ群 */}
              <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
                {genderText && (
                  <span className="rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-bold text-primary backdrop-blur-sm">
                    {genderText}
                  </span>
                )}
                {photoCount > 1 && (
                  <span className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                    <span className="material-symbols-outlined text-[14px]">photo_library</span>
                    {photoCount}
                  </span>
                )}
              </div>

              {/* 下部: 名前と年齢（グラデーション付き） */}
              <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/40 to-transparent px-4 pb-4 pt-10">
                <div className="flex items-end justify-between gap-2 text-white">
                  <h3 className="text-base font-bold leading-tight drop-shadow-sm">
                    {cast.displayName}
                    {cast.age !== null && (
                      <span className="ml-1 text-sm font-medium opacity-90">
                        {cast.age}歳
                      </span>
                    )}
                  </h3>
                  <span className="material-symbols-outlined text-white/90">
                    chevron_right
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <CastDetailModal
        cast={selectedCast}
        isOpen={selectedCast !== null}
        onClose={() => setSelectedCast(null)}
      />
    </>
  );
}

export default CastList;
