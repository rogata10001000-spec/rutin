import { retrieveCheckoutSession } from "@/lib/stripe";

type PageProps = {
  searchParams?: Promise<{ session_id?: string }>;
};

export default async function SubscribeCompletePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionId = params?.session_id;

  if (!sessionId) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-900">契約確認ができません</h1>
        <p className="mt-3 text-sm text-gray-600">
          決済完了後のURLからアクセスしてください。
        </p>
      </main>
    );
  }

  let verified = false;
  try {
    const session = await retrieveCheckoutSession(sessionId);
    verified = session.mode === "subscription" && session.payment_status !== "unpaid";
  } catch {
    verified = false;
  }

  if (!verified) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-900">契約確認中です</h1>
        <p className="mt-3 text-sm text-gray-600">
          決済情報を確認できませんでした。LINEに戻って、しばらくしてからお問い合わせください。
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-12 text-center">
      <div className="mb-6 rounded-full bg-primary/10 p-4">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: "40px" }}>
          check_circle
        </span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">契約ありがとうございます</h1>
      <p className="mt-3 text-sm text-gray-600">
        担当の伴走メイトからのメッセージをお待ちください。
      </p>
      <p className="mt-1 text-sm text-gray-600">
        スマホの方はLINEアプリに戻って、トークの確認をお願いします。
      </p>
      <a
        href="line://"
        className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
      >
        LINEに戻る
      </a>
      <p className="mt-3 text-xs text-gray-500">
        ※ PCでお手続きされた方は、お使いのスマホでLINEを開いてください。
      </p>
    </main>
  );
}
