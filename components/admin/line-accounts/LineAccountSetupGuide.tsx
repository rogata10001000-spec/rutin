const setupSteps = [
  {
    label: "Step 1",
    title: "LINE側でチャネル作成",
    body: "共通Routine公式LINEと同じプロバイダー内に、メイト用のMessaging APIチャネルを作成します。",
    details: ["Channel ID", "Channel secret", "Channel access token", "友だち追加URL"],
  },
  {
    label: "Step 2",
    title: "Routineに登録",
    body: "この画面の「アカウントを追加」から、担当メイトとLINEチャネル情報を登録します。",
    details: ["担当メイト", "token/secret", "リッチメニューID", "友だち追加URL"],
  },
  {
    label: "Step 3",
    title: "Webhook URLを設定",
    body: "一覧に表示されたWebhook URLをLINE Developersの該当チャネルに設定し、Use webhookを有効化します。",
    details: ["URLをコピー", "Webhook URLへ貼付", "Use webhook ON", "Verify実行"],
  },
  {
    label: "Step 4",
    title: "実機で確認",
    body: "契約後の案内、友だち追加、受信、管理画面からの返信が想定通り動くか確認します。",
    details: ["契約完了案内", "Inbox反映", "アカウント名表示", "返信元確認"],
  },
];

const operationFlow = [
  "共通LINEで契約",
  "メイトLINE追加案内",
  "ユーザーが友だち追加",
  "Inboxに受信",
  "メイトLINEから返信",
];

const checklist = [
  "同一プロバイダー内でメイト用Messaging APIチャネルを作成した",
  "LINE_TOKEN_ENC_KEYを本番環境にも設定した",
  "チャネルシークレットとアクセストークンをRoutineに登録した",
  "友だち追加URLを登録した",
  "一覧のWebhook URLをLINE Developersに設定し、Use webhookをONにした",
  "テストユーザーで契約、友だち追加、受信、返信を確認した",
];

export function LineAccountSetupGuide() {
  return (
    <section className="space-y-5 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-stone-50 p-5 shadow-soft">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
            Setup Guide
          </p>
          <h2 className="mt-1 text-lg font-bold text-stone-800">
            メイト別LINE公式アカウントの設定手順
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">
            メイト個別LINEは、LINE Developersでチャネルを作成してからRoutineに登録します。
            契約入口は共通Routine LINEのまま維持し、契約後にメイトLINEへ誘導します。
          </p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          必須: 共通LINEと同じプロバイダーで作成
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/70 p-3">
        <div className="flex min-w-[760px] items-center gap-2">
          {operationFlow.map((item, index) => (
            <div key={item} className="flex flex-1 items-center gap-2">
              <div className="flex min-h-[76px] flex-1 items-center justify-center rounded-xl border border-stone-200 bg-white px-3 text-center text-sm font-bold text-stone-700 shadow-sm">
                {item}
              </div>
              {index < operationFlow.length - 1 && (
                <div className="shrink-0 text-lg font-bold text-emerald-500">→</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {setupSteps.map((step) => (
          <div key={step.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
              {step.label}
            </span>
            <h3 className="mt-3 font-bold text-stone-800">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{step.body}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {step.details.map((detail) => (
                <span
                  key={detail}
                  className="inline-flex whitespace-nowrap rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600"
                >
                  {detail}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="font-bold text-stone-800">登録後の動き</h3>
          <div className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
            <p>
              ユーザーがメイトLINEを友だち追加して最初に反応すると、Routineが同一
              <code className="mx-1 rounded bg-stone-100 px-1.5 py-0.5">line_user_id</code>
              で既存ユーザーを特定し、会話中アカウントをメイトLINEへ切り替えます。
            </p>
            <p>
              切り替え前の返信や通知は共通LINEから送信され、切り替え後はメイト個別LINEから送信されます。
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="font-bold text-stone-800">最終チェック</h3>
          <ul className="mt-3 space-y-2">
            {checklist.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-6 text-stone-600">
                <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
