export default function PointsPurchaseCompletePage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-4 rounded-full bg-amber-100 p-4 text-3xl">!</div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">
        ポイント購入は準備中です
      </h1>
      <p className="mb-6 text-gray-600">
        ポイント機能はMVP対象外のため、現在は利用できません。
      </p>
      <p className="text-sm text-gray-400">
        このページを閉じてLINEに戻ってください
      </p>
    </div>
  );
}
