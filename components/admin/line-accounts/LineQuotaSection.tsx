import type { LineAccountQuotaItem } from "@/actions/admin/line-accounts";

/**
 * LINE公式アカウントごとの月間メッセージ枠。
 *
 * 「上限に達すると通知・メッセージの push が静かに全停止する」ため、
 * 枠が尽きる前に有料プランへの切り替え時期が分かるようにする画面。
 * 数字はLINEの公式API（プラン変更・手動配信に自動追従）。
 */

const formatCount = (n: number) => n.toLocaleString("ja-JP");

function barColor(level: "safe" | "warning" | "critical"): string {
  if (level === "critical") return "bg-red-500";
  if (level === "warning") return "bg-amber-500";
  return "bg-emerald-500";
}

function QuotaCard({ item }: { item: LineAccountQuotaItem }) {
  const { quota } = item;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-stone-800">
            {item.name}
            {item.isDefault && (
              <span className="ml-2 whitespace-nowrap rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                共通
              </span>
            )}
          </p>
          {item.castName && (
            <p className="mt-0.5 text-xs text-stone-500">担当: {item.castName}</p>
          )}
        </div>
        {quota && quota.warnLevel !== "safe" && (
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${
              quota.warnLevel === "critical"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {quota.warnLevel === "critical" ? "上限間近" : "要注意"}
          </span>
        )}
      </div>

      {/* 取得失敗は「0通」「無制限」と断定しない */}
      {!quota ? (
        <p className="mt-4 text-sm text-stone-500">
          送信数を取得できませんでした。アクセストークンの設定を確認するか、時間をおいて再読み込みしてください。
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-stone-900">{formatCount(quota.used)}</span>
            <span className="text-sm text-stone-500">
              / {quota.limit === null ? "無制限" : `${formatCount(quota.limit)}通`}（今月）
            </span>
          </div>

          {quota.limit !== null && quota.ratio !== null && (
            <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-full rounded-full ${barColor(quota.warnLevel)}`}
                  style={{ width: `${Math.min(100, Math.round(quota.ratio * 100))}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-stone-500">
                残り {formatCount(quota.remaining ?? 0)}通（使用率{" "}
                {Math.round(quota.ratio * 100)}%）
              </p>
            </>
          )}

          <p className="mt-3 text-xs leading-relaxed text-stone-500">
            今のペースだと月末までに約{" "}
            <span className="font-semibold text-stone-700">
              {formatCount(quota.projectedMonthEnd)}通
            </span>
            {quota.limit !== null && quota.willExceed ? (
              <span className="font-semibold text-red-600">
                {" "}
                — 上限を超える見込みです
              </span>
            ) : (
              " の見込みです"
            )}
          </p>

          {quota.limit !== null && quota.warnLevel !== "safe" && (
            <div
              className={`mt-3 rounded-xl p-3 text-xs leading-relaxed ${
                quota.warnLevel === "critical"
                  ? "bg-red-50 text-red-800"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              上限に達すると、このアカウントからの通知・メッセージ送信がすべて止まります（会員には気づけません）。
              <a
                href="https://manager.line.biz/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline"
              >
                LINE Official Account Manager
              </a>
              で有料プラン（ライト 5,000通/月・スタンダード 30,000通/月）への切り替えをご検討ください。
              切り替えは即日反映され、この画面の上限表示も自動で追従します。
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function LineQuotaSection({ items }: { items: LineAccountQuotaItem[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-bold text-stone-900">今月のメッセージ枠</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          アカウントごとの送信数と上限です。数字はLINEの集計（手動配信も含む）で、5分ごとに更新されます。
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <QuotaCard key={item.accountKey} item={item} />
        ))}
      </div>
    </section>
  );
}
