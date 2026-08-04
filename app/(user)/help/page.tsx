import { getPublicFaqItems } from "@/lib/faq";

// よくある質問はDBから読む（管理画面 /admin/faq で編集可能）ため動的レンダリング。
export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const faqItems = await getPublicFaqItems();

  return (
    <div className="space-y-5">
      {/* サービス概要 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-stone-900">Rutinの使い方</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          Rutinは、あなた専属の伴走メイトがLINEで毎日サポートする習慣化サポートサービスです。
          日々のチェックインやメッセージのやりとりを通じて、あなたの目標達成をお手伝いします。
        </p>
      </section>

      {/* チェックインの使い方 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">毎日のチェックイン</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-stone-600">
          <p>
            毎日、担当メイトからチェックインのメッセージが届きます。
            今日の調子を「◯」「△」「×」で回答してください。
          </p>
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="mb-2 font-bold text-stone-700">回答の目安</p>
            <ul className="space-y-1.5">
              <li>
                <span className="font-medium text-green-600">◯ 調子いい！</span>
                <span className="text-stone-500"> - 予定通り進められそう</span>
              </li>
              <li>
                <span className="font-medium text-yellow-600">△ まあまあ</span>
                <span className="text-stone-500"> - 少し不安がある</span>
              </li>
              <li>
                <span className="font-medium text-red-600">× つらい...</span>
                <span className="text-stone-500"> - サポートが必要</span>
              </li>
            </ul>
          </div>
          <p>
            回答に応じて、担当メイトがメッセージを送ってくれます。
            どんな小さなことでも気軽に相談してください。
          </p>
        </div>
      </section>

      {/* よくある質問（管理画面で編集可能。0件なら丸ごと出さない） */}
      {faqItems.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-stone-900">よくある質問</h2>
          <div className="mt-3 divide-y divide-stone-100">
            {faqItems.map((item) => (
              <details key={item.id} className="group py-1">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-medium text-stone-800 [&::-webkit-details-marker]:hidden">
                  <span>{item.question}</span>
                  <svg
                    className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="whitespace-pre-wrap pb-3 pr-7 text-sm leading-relaxed text-stone-600">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* 契約の確認・変更への導線 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">契約内容の確認・変更</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          プランの変更・解約・一時停止・お支払い方法の変更は、マイページからいつでもお手続きいただけます。
        </p>
        <a
          href="/account/plan"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark"
        >
          マイページを開く
        </a>
      </section>

      {/* お問い合わせ */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">お問い合わせ</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          ご不明な点がありましたら、LINEのトーク画面でお気軽にメッセージをお送りください。
          担当メイトまたは運営チームがお答えします。
        </p>
        <a
          href="https://line.me/R/"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full border border-green-600 bg-green-50 px-5 py-2.5 text-sm font-bold text-green-700 transition-colors hover:bg-green-100"
        >
          LINEアプリを開く
        </a>
      </section>
    </div>
  );
}
