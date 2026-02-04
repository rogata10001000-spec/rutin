import Link from "next/link";

export const dynamic = "force-static";

export default function HelpPage() {
  return (
    <div className="space-y-6">
      {/* サービス概要 */}
      <section className="rounded-lg border bg-white p-6">
        <h1 className="mb-4 text-xl font-bold text-gray-900">Rutinの使い方</h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          Rutinは、あなた専属のコンシェルジュがLINEで毎日サポートするパーソナルケアサービスです。
          日々のチェックインやメッセージのやりとりを通じて、あなたの目標達成をお手伝いします。
        </p>
      </section>

      {/* チェックインの使い方 */}
      <section className="rounded-lg border bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          毎日のチェックイン
        </h2>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            毎日、担当キャストからチェックインのメッセージが届きます。
            今日の調子を「◯」「△」「×」で回答してください。
          </p>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="font-medium text-gray-700 mb-2">回答の目安</p>
            <ul className="space-y-1">
              <li><span className="text-green-600">◯ 調子いい！</span> - 予定通り進められそう</li>
              <li><span className="text-yellow-600">△ まあまあ</span> - 少し不安がある</li>
              <li><span className="text-red-600">× つらい...</span> - サポートが必要</li>
            </ul>
          </div>
          <p>
            回答に応じて、担当キャストがメッセージを送ってくれます。
            どんな小さなことでも気軽に相談してください。
          </p>
        </div>
      </section>

      {/* ポイント購入 */}
      <section className="rounded-lg border bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          ポイント購入
        </h2>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            担当キャストにギフトを送るには、ポイントが必要です。
            ポイントはクレジットカードで購入できます。
          </p>
          <Link
            href="/points"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            ポイントを購入する
          </Link>
          <p className="text-xs text-gray-500">
            ※ポイント購入ページへ移動します。LINEから開いた場合は自動でログインされます。
          </p>
        </div>
      </section>

      {/* ギフト送信 */}
      <section className="rounded-lg border bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          ギフトを送る
        </h2>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            いつもサポートしてくれる担当キャストに感謝の気持ちを込めて、
            ギフトを送ることができます。
          </p>
          <Link
            href="/gift"
            className="inline-flex items-center justify-center rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700"
          >
            ギフトを選ぶ
          </Link>
          <p className="text-xs text-gray-500">
            ※ギフト一覧ページへ移動します。お持ちのポイントで購入できます。
          </p>
        </div>
      </section>

      {/* よくある質問 */}
      <section className="rounded-lg border bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          よくある質問
        </h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium text-gray-900 text-sm">Q. 担当キャストを変更できますか？</h3>
            <p className="mt-1 text-sm text-gray-600">
              A. はい、担当変更のご希望はLINEメッセージでお知らせください。運営チームが対応いたします。
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 text-sm">Q. 解約したい場合は？</h3>
            <p className="mt-1 text-sm text-gray-600">
              A. LINEメッセージで解約希望をお伝えください。現在の契約期間終了時に解約処理を行います。
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 text-sm">Q. ポイントの有効期限はありますか？</h3>
            <p className="mt-1 text-sm text-gray-600">
              A. ポイントに有効期限はありません。いつでもお好きな時にギフトに交換できます。
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 text-sm">Q. 複数のキャストと話せますか？</h3>
            <p className="mt-1 text-sm text-gray-600">
              A. 基本的にはお一人の担当キャストがサポートしますが、
              プランによっては複数のキャストとお話しいただける場合もあります。
            </p>
          </div>
        </div>
      </section>

      {/* お問い合わせ */}
      <section className="rounded-lg border bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          お問い合わせ
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          ご不明な点がありましたら、LINEのトーク画面でお気軽にメッセージをお送りください。
          担当キャストまたは運営チームがお答えします。
        </p>
        <a
          href="https://line.me/R/"
          className="inline-flex items-center justify-center rounded-md border border-green-600 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
        >
          LINEアプリを開く
        </a>
      </section>
    </div>
  );
}
