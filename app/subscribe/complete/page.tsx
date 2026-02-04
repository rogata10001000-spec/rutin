export default function SubscribeCompletePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-12 text-center">
      <div className="mb-6 rounded-full bg-indigo-100 p-4">
        <span className="text-4xl">🎉</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">契約ありがとうございます！</h1>
      <p className="mt-3 text-sm text-gray-600">
        担当キャストからのメッセージをお待ちください。
      </p>
      <p className="mt-1 text-sm text-gray-600">
        LINEアプリに戻って、トークの確認をお願いします。
      </p>
      <a
        href="line://"
        className="mt-6 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        LINEに戻る
      </a>
    </main>
  );
}
