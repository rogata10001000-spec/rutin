// 法的ページは公式サイト（rutin.site）側でホストしている。
const LEGAL_BASE_URL = "https://rutin.site";

export const LEGAL_URLS = {
  terms: `${LEGAL_BASE_URL}/legal/terms`,
  privacy: `${LEGAL_BASE_URL}/legal/privacy`,
  tokushoho: `${LEGAL_BASE_URL}/legal/tokushoho`,
} as const;

type LegalFooterProps = {
  /** true のとき「お申込みにより同意したものとみなされます」の同意文言を先頭に出す（決済ボタンがある画面用） */
  withConsentNote?: boolean;
};

/**
 * 申込ファネル共通の法的リンクフッター。
 * 特定商取引法・定期購入の表示義務の観点から、決済に至る画面には
 * 利用規約・プライバシーポリシー・特商法表記への導線を常設する。
 */
export function LegalFooter({ withConsentNote = false }: LegalFooterProps) {
  return (
    <footer className="mx-4 mb-8 mt-6 text-center">
      {withConsentNote && (
        <p className="text-[11px] leading-relaxed text-[#8A786D]">
          お申込みにより、利用規約・プライバシーポリシーに同意したものとみなされます。
        </p>
      )}
      <nav aria-label="法的情報">
        <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[#8A786D]">
          <li>
            <a
              href={LEGAL_URLS.terms}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              利用規約
            </a>
          </li>
          <li>
            <a
              href={LEGAL_URLS.privacy}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              プライバシーポリシー
            </a>
          </li>
          <li>
            <a
              href={LEGAL_URLS.tokushoho}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              特定商取引法に基づく表記
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
