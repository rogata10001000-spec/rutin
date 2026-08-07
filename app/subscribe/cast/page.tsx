import { listAvailableCasts } from "../../../actions/subscriptions";
import { CastList } from "../../../components/cast/CastList";
import { CastGenderFilter, type CastGenderFilterValue } from "../../../components/cast/CastGenderFilter";
import { getUserFromServerCookies } from "@/lib/auth";
import { getTrialPeriodDays } from "@/lib/trial";
import { LegalFooter } from "@/components/subscribe/LegalFooter";
import { getFunnelCopyValues } from "@/lib/funnel-copy";
import {
  getFunnelCopyDef,
  parseFunnelCopyNumber,
  renderFunnelCopy,
} from "@/lib/funnel-copy-defs";
import type { StaffGender } from "@/lib/supabase/types";

/** メイト一覧・公開プロフィールは常に最新を読む（保存直後の反映と整合） */
export const dynamic = "force-dynamic";

const GENDER_VALUES: ReadonlySet<StaffGender> = new Set(["female", "male", "other"]);

function parseGender(value: string | undefined): StaffGender | undefined {
  if (!value) return undefined;
  return GENDER_VALUES.has(value as StaffGender) ? (value as StaffGender) : undefined;
}

type PageProps = {
  searchParams?: Promise<{
    gender?: string;
    canceled?: string;
    preview?: string;
    cast?: string;
  }>;
};

export default async function SubscribeCastPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const genderFilter = parseGender(params.gender);
  const filterValue: CastGenderFilterValue = genderFilter ?? "all";
  const showCanceledBanner = params.canceled === "1" || params.canceled === "true";
  // 管理画面プレビュー（下書き文言を優先表示）
  const isPreview = params.preview === "1";
  const trialDays = getTrialPeriodDays();

  // 文言取得は既存フェッチと並列にする（ホットパスへ直列 await を足さない）
  const [userToken, result, copy] = await Promise.all([
    getUserFromServerCookies(),
    listAvailableCasts({ gender: genderFilter }),
    getFunnelCopyValues(
      [
        "cast.nav.title",
        "cast.hero.title",
        "cast.hero.body",
        "cast.banner.noline.title",
        "cast.banner.noline.body",
        "cast.banner.canceled.title",
        "cast.banner.canceled.body",
        "cast.empty.filtered",
        "cast.empty.none",
        "cast.error.fetch",
        "cast.scarcity.threshold",
        "detail.profile.heading",
        "detail.profile.empty",
        "detail.cta",
      ],
      { preview: isPreview }
    ),
  ]);

  const scarcityDef = getFunnelCopyDef("cast.scarcity.threshold");
  const scarcityThreshold = scarcityDef
    ? parseFunnelCopyNumber(scarcityDef, copy["cast.scarcity.threshold"])
    : 5;

  if (!result.ok) {
    return (
      <main className="mx-auto min-h-screen max-w-[480px] bg-background-light px-4 py-8">
        <h1 className="text-xl font-bold text-[#2D241E]">{copy["cast.nav.title"]}</h1>
        <p className="mt-3 text-sm text-[#6B5A51]">{copy["cast.error.fetch"]}</p>
      </main>
    );
  }

  const casts = result.data.casts;
  // 管理画面プレビューのディープリンク: ?cast=<castId> で該当メイトの詳細モーダルを自動で開く
  const initialCastId =
    params.cast && casts.some((c) => c.id === params.cast) ? params.cast : undefined;

  return (
    <div className="min-h-screen bg-background-light">
      <div className="relative mx-auto flex h-auto min-h-screen w-full max-w-[480px] flex-col overflow-x-hidden border-x border-orange-50 bg-background-light antialiased">
        <nav className="sticky top-0 z-50 flex items-center justify-center bg-background-light/90 p-4 pb-2 backdrop-blur-md">
          <h2 className="text-lg font-bold leading-tight text-[#2D241E]">
            {copy["cast.nav.title"]}
          </h2>
        </nav>

        <main className="flex-1 pb-12">
          {/* 文言を空にしたら枠ごと出さない（管理画面で「このバナーを消す」を成立させる） */}
          {showCanceledBanner &&
            (copy["cast.banner.canceled.title"] || copy["cast.banner.canceled.body"]) && (
            <div className="mx-4 mt-4 rounded-2xl border border-terracotta/20 bg-terracotta/5 p-4 text-sm font-medium text-stone-700">
              <div className="mb-1 flex items-center gap-2 font-bold text-terracotta">
                <span className="material-symbols-outlined text-[20px]">info</span>
                {copy["cast.banner.canceled.title"]}
              </div>
              <p className="text-xs leading-relaxed text-stone-600">
                {copy["cast.banner.canceled.body"]}
              </p>
            </div>
          )}

          {!userToken.ok &&
            (copy["cast.banner.noline.title"] || copy["cast.banner.noline.body"]) && (
            <div className="mx-4 mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-medium text-amber-800">
              <div className="mb-1 flex items-center gap-2 font-bold">
                <span className="material-symbols-outlined text-[20px]">
                  info
                </span>
                {copy["cast.banner.noline.title"]}
              </div>
              <p className="text-xs leading-relaxed text-amber-700">
                {copy["cast.banner.noline.body"]}
              </p>
            </div>
          )}

          <div className="px-4 py-4">
            <div className="flex flex-col gap-2 rounded-2xl border border-primary/20 bg-primary/10 p-5">
              <div className="flex items-center gap-2 text-sm font-bold tracking-wide text-primary">
                <span className="material-symbols-outlined fill-current text-[20px]">
                  verified_user
                </span>
                {renderFunnelCopy(copy["cast.hero.title"], { days: trialDays })}
              </div>
              <p className="text-sm font-medium leading-relaxed text-[#2D241E]">
                {renderFunnelCopy(copy["cast.hero.body"], { days: trialDays })}
              </p>
            </div>
          </div>

          <CastGenderFilter current={filterValue} />

          {casts.length === 0 ? (
            <div className="mx-4 mt-2 rounded-2xl border border-warm-border/50 bg-white p-6 text-center text-sm text-[#6B5A51]">
              {genderFilter ? copy["cast.empty.filtered"] : copy["cast.empty.none"]}
            </div>
          ) : (
            <CastList
              casts={casts}
              scarcityThreshold={scarcityThreshold}
              detailCopy={{
                profileHeading: copy["detail.profile.heading"],
                profileEmpty: copy["detail.profile.empty"],
                cta: copy["detail.cta"],
              }}
              initialCastId={initialCastId}
            />
          )}

          {/* 申込ファネルの入口にも法的リンクを常設する */}
          <LegalFooter />
        </main>
      </div>
    </div>
  );
}
