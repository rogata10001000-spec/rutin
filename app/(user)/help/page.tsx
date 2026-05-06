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
            毎日、担当メイトからチェックインのメッセージが届きます。
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
            回答に応じて、担当メイトがメッセージを送ってくれます。
            どんな小さなことでも気軽に相談してください。
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
            <h3 className="font-medium text-gray-900 text-sm">Q. 担当メイトを変更できますか？</h3>
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
            <h3 className="font-medium text-gray-900 text-sm">Q. 複数のメイトと話せますか？</h3>
            <p className="mt-1 text-sm text-gray-600">
              A. 基本的にはお一人の担当メイトがサポートしますが、
              プランによっては複数のメイトとお話しいただける場合もあります。
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
          担当メイトまたは運営チームがお答えします。
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
