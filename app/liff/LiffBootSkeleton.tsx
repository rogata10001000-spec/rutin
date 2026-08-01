/**
 * LIFF ページ共通の待機表示。
 *
 * LIFF の各クライアント（LiffStartClient / LiffMyPageClient）は初期化中に
 * 同じスピナーと文言を出すため、ここでも骨組みではなく**同じ見た目**をそのまま出す。
 * こうするとサーバー側の解決からクライアント初期化までが1つの待機に見え、
 * 「スケルトン → スピナー」の切り替わりが起きない。
 */
export function LiffBootSkeleton() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-primary"
        aria-hidden
      />
      <p className="whitespace-nowrap text-sm text-stone-500">読み込んでいます…</p>
    </div>
  );
}

export default LiffBootSkeleton;
