import { getFaqItemsForAdmin } from "@/actions/admin/faq";
import { FaqEditor } from "@/components/admin/faq/FaqEditor";
import { ErrorState } from "@/components/common/ErrorState";

export const dynamic = "force-dynamic";

export default async function AdminFaqPage() {
  const result = await getFaqItemsForAdmin();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">よくある質問の編集</h1>
          <p className="mt-1 text-sm text-stone-500">
            ヘルプページに表示される質問と回答を編集します。表示中の項目が並び順どおりに公開されます。
          </p>
        </div>
        <a
          href="/help"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
        >
          公開ページを確認
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>

      {result.ok ? (
        <FaqEditor initialItems={result.data.items} />
      ) : (
        <ErrorState title="よくある質問を読み込めませんでした" message={result.error.message} />
      )}
    </div>
  );
}
