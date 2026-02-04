import { listAvailableCasts } from "../../../actions/subscriptions";
import { CastList } from "../../../components/cast/CastList";

export default async function SubscribeCastPage() {
  const result = await listAvailableCasts({});

  if (!result.ok) {
    return (
      <main className="mx-auto min-h-screen max-w-[480px] bg-background-light px-4 py-8">
        <h1 className="text-xl font-bold text-[#2D241E]">キャスト選択</h1>
        <p className="mt-3 text-sm text-[#6B5A51]">
          現在キャスト一覧を取得できません。時間をおいて再度お試しください。
        </p>
      </main>
    );
  }

  if (result.data.casts.length === 0) {
    return (
      <main className="mx-auto min-h-screen max-w-[480px] bg-background-light px-4 py-8">
        <h1 className="text-xl font-bold text-[#2D241E]">キャスト選択</h1>
        <p className="mt-3 text-sm text-[#6B5A51]">
          現在、新規受付中のキャストがいません。
        </p>
        <p className="mt-1 text-sm text-[#6B5A51]">
          時間をおいて再度お試しください。
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background-light">
      <div className="relative mx-auto flex h-auto min-h-screen w-full max-w-[480px] flex-col overflow-x-hidden border-x border-orange-50 bg-background-light antialiased">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 flex items-center justify-between bg-background-light/90 p-4 pb-2 backdrop-blur-md">
          <div className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10">
            <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>
              arrow_back_ios_new
            </span>
          </div>
          <h2 className="flex-1 pr-10 text-center text-lg font-bold leading-tight text-[#2D241E]">
            相談員を選ぶ
          </h2>
        </nav>

        <main className="flex-1 pb-24">
          {/* Promotional Banner */}
          <div className="px-4 py-4">
            <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/10 p-6">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-bold tracking-wide text-primary">
                  <span className="material-symbols-outlined fill-current text-[20px]">
                    verified_user
                  </span>
                  期間限定オファー
                </div>
                <h1 className="text-xl font-black leading-tight text-[#2D241E]">
                  7日間無料トライアルで
                  <br />
                  理想の相談を始めましょう
                </h1>
                <p className="text-sm font-medium text-[#6B5A51]">
                  いつでも解約可能。まずは気軽にお試しください。
                </p>
              </div>
              <button className="flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-primary text-base font-bold text-white shadow-lg shadow-primary/30 transition-transform active:scale-95">
                無料で試してみる
              </button>
            </div>
          </div>

          {/* Category Filters */}
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto p-4">
            <div className="flex h-9 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-white shadow-sm">
              <p className="text-sm font-bold">すべて</p>
            </div>
            {["結婚相談", "片思い", "復縁", "自分磨き"].map((cat) => (
              <div
                key={cat}
                className="flex h-9 shrink-0 items-center justify-center rounded-full border border-warm-border bg-white px-5 dark:bg-zinc-900"
              >
                <p className="text-sm font-medium text-[#2D241E] dark:text-zinc-300">
                  {cat}
                </p>
              </div>
            ))}
          </div>

          {/* Cast List - Client Component with Modal */}
          <CastList casts={result.data.casts} />
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 z-[60] flex w-full max-w-[480px] items-center justify-between border-t border-warm-border/50 bg-white/95 px-6 py-3 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="flex flex-col items-center gap-1 text-[#6B5A51] dark:text-zinc-500">
            <span className="material-symbols-outlined">home</span>
            <span className="text-[10px] font-bold">ホーム</span>
          </div>
          <div className="flex flex-col items-center gap-1 text-primary">
            <span className="material-symbols-outlined fill-current">groups</span>
            <span className="text-[10px] font-bold">相談員</span>
          </div>
          <div className="flex flex-col items-center gap-1 text-[#6B5A51] dark:text-zinc-500">
            <span className="material-symbols-outlined">chat_bubble</span>
            <span className="text-[10px] font-bold">メッセージ</span>
          </div>
          <div className="flex flex-col items-center gap-1 text-[#6B5A51] dark:text-zinc-500">
            <span className="material-symbols-outlined">account_circle</span>
            <span className="text-[10px] font-bold">マイページ</span>
          </div>
        </nav>
        <div className="h-8 bg-white dark:bg-zinc-950"></div>
      </div>
    </div>
  );
}
