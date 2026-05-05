import { listAvailableCasts } from "../../../actions/subscriptions";
import { CastList } from "../../../components/cast/CastList";
import { CastGenderFilter, type CastGenderFilterValue } from "../../../components/cast/CastGenderFilter";
import { getUserFromServerCookies } from "@/lib/auth";
import type { StaffGender } from "@/lib/supabase/types";

const GENDER_VALUES: ReadonlySet<StaffGender> = new Set(["female", "male", "other"]);

function parseGender(value: string | undefined): StaffGender | undefined {
  if (!value) return undefined;
  return GENDER_VALUES.has(value as StaffGender) ? (value as StaffGender) : undefined;
}

type PageProps = {
  searchParams?: Promise<{ gender?: string }>;
};

export default async function SubscribeCastPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const genderFilter = parseGender(params.gender);
  const filterValue: CastGenderFilterValue = genderFilter ?? "all";

  const userToken = await getUserFromServerCookies();
  const result = await listAvailableCasts({ gender: genderFilter });

  if (!result.ok) {
    return (
      <main className="mx-auto min-h-screen max-w-[480px] bg-background-light px-4 py-8">
        <h1 className="text-xl font-bold text-[#2D241E]">伴走メイトを選ぶ</h1>
        <p className="mt-3 text-sm text-[#6B5A51]">
          現在、伴走メイトの一覧を取得できません。時間をおいて再度お試しください。
        </p>
      </main>
    );
  }

  const casts = result.data.casts;

  return (
    <div className="min-h-screen bg-background-light">
      <div className="relative mx-auto flex h-auto min-h-screen w-full max-w-[480px] flex-col overflow-x-hidden border-x border-orange-50 bg-background-light antialiased">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 flex items-center justify-center bg-background-light/90 p-4 pb-2 backdrop-blur-md">
          <h2 className="text-lg font-bold leading-tight text-[#2D241E]">
            伴走メイトを選ぶ
          </h2>
        </nav>

        <main className="flex-1 pb-12">
          {/* LINE未連携の警告（ファーストビュー上部） */}
          {!userToken.ok && (
            <div className="mx-4 mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-medium text-amber-800">
              <div className="mb-1 flex items-center gap-2 font-bold">
                <span className="material-symbols-outlined text-[20px]">
                  info
                </span>
                LINEからアクセスしてください
              </div>
              <p className="text-xs leading-relaxed text-amber-700">
                ご契約には、LINE公式アカウントから届く案内リンクからのアクセスが必要です。
                このまま伴走メイトを選ぶことはできますが、契約手続きには進めません。
              </p>
            </div>
          )}

          {/* 7日間無料トライアル案内（純粋な案内、ボタンなし） */}
          <div className="px-4 py-4">
            <div className="flex flex-col gap-2 rounded-2xl border border-primary/20 bg-primary/10 p-5">
              <div className="flex items-center gap-2 text-sm font-bold tracking-wide text-primary">
                <span className="material-symbols-outlined fill-current text-[20px]">
                  verified_user
                </span>
                7日間無料でお試し
              </div>
              <p className="text-sm font-medium leading-relaxed text-[#2D241E]">
                気になる伴走メイトを選んで、まずは7日間無料でメッセージのやりとりを体験できます。
                いつでも解約可能です。
              </p>
            </div>
          </div>

          {/* 性別フィルター */}
          <CastGenderFilter current={filterValue} />

          {/* キャスト一覧 */}
          {casts.length === 0 ? (
            <div className="mx-4 mt-2 rounded-2xl border border-warm-border/50 bg-white p-6 text-center text-sm text-[#6B5A51]">
              {genderFilter
                ? "条件に合う伴走メイトが見つかりませんでした。フィルターを変えてみてください。"
                : "現在、新規受付中の伴走メイトがいません。時間をおいて再度お試しください。"}
            </div>
          ) : (
            <CastList casts={casts} />
          )}
        </main>
      </div>
    </div>
  );
}
