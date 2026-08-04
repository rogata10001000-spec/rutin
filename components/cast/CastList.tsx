"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { AvailableCast } from "@/actions/subscriptions";
import { GENDER_LABEL } from "@/lib/cast-display";
import type { CastDetailCopy } from "./CastDetailModal";

/**
 * 詳細モーダルは Swiper（JS＋CSS）を抱えているが、開くのはカードをタップした後。
 * 初回描画（＝申込導線の1画面目）で読み込まないよう遅延読み込みにし、
 * さらに「選択中のメイトがいるときだけマウント」してタップ時に初めて取得させる。
 */
const CastDetailModal = dynamic(
  () => import("./CastDetailModal").then((m) => m.CastDetailModal),
  {
    ssr: false,
    // 取得中の一瞬もタップに反応したことが分かるよう、モーダルと同じ暗幕を先に出す
    loading: () => (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        aria-hidden
      >
        <div className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      </div>
    ),
  }
);

type CastListProps = {
  casts: AvailableCast[];
  /** 「残り◯枠」バッジを出す残数のしきい値（funnel_copy: cast.scarcity.threshold） */
  scarcityThreshold: number;
  /** 詳細モーダルの文言（funnel_copy: detail.*） */
  detailCopy: CastDetailCopy;
  /** 指定があれば該当メイトの詳細モーダルを最初から開く（管理画面プレビューのディープリンク用） */
  initialCastId?: string;
};

export function CastList({
  casts,
  scarcityThreshold,
  detailCopy,
  initialCastId,
}: CastListProps) {
  const [selectedCast, setSelectedCast] = useState<AvailableCast | null>(
    () => casts.find((cast) => cast.id === initialCastId) ?? null
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2">
        {casts.map((cast) => {
          const mainPhoto = cast.photos[0]?.url;
          const photoCount = cast.photos.length;
          const genderText = cast.gender ? GENDER_LABEL[cast.gender] : null;
          const remainingSlots =
            cast.capacityLimit !== null ? Math.max(0, cast.capacityLimit - cast.assignedCount) : null;
          const isScarce = remainingSlots !== null && remainingSlots <= scarcityThreshold;

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

              {/* 残り枠（希少性） */}
              {isScarce && (
                <div className="absolute right-3 top-3 z-10">
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    残り{remainingSlots}枠
                  </span>
                </div>
              )}

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

      {selectedCast !== null && (
        <CastDetailModal
          cast={selectedCast}
          isOpen
          onClose={() => setSelectedCast(null)}
          scarcityThreshold={scarcityThreshold}
          copy={detailCopy}
        />
      )}
    </>
  );
}

export default CastList;
