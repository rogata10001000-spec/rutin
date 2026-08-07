"use client";

import type { AiStats } from "@/actions/admin/ai-stats";
import { EmptyState } from "@/components/common/EmptyState";
import { AiFailureList } from "./AiFailureList";
import { AiMateTable } from "./AiMateTable";
import { formatCount, formatJpy, formatRate, jstDate } from "./format";

type Props = {
  data: AiStats;
};

function KpiCard({
  label,
  value,
  meaning,
  tone = "default",
}: {
  label: string;
  value: string;
  meaning: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-black ${
          tone === "warn" ? "text-amber-600" : "text-stone-800"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-stone-500">{meaning}</p>
    </div>
  );
}

export function AiStatsDashboard({ data }: Props) {
  const { totals, adoption, cost, pregen } = data;

  if (totals.all === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white shadow-soft">
        <EmptyState
          title="まだAI下書きが使われていません"
          description="メイトがチャット画面で「AIで下書き」を押すと、生成回数・採用率・かかった費用がここに集まります。"
        />
      </div>
    );
  }

  const pregenWastedRate =
    pregen.success > 0 ? Math.round((pregen.wasted / pregen.success) * 100) : null;

  return (
    <div className="space-y-6">
      {/* 集計の前提 */}
      <p className="text-xs text-stone-500">
        集計期間: {jstDate(data.since)} 〜 現在（JST）
        {data.windowTruncated && (
          <>
            {" ／ "}
            <span className="text-amber-700">
              期間内の件数が多いため、メイト別・費用は直近{formatCount(data.windowLimit)}
              件を対象に集計しています
            </span>
          </>
        )}
      </p>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="生成回数"
          value={`${formatCount(totals.all)} 回`}
          meaning={`手動 ${formatCount(totals.bySource.manual)}／一括 ${formatCount(
            totals.bySource.bulk
          )}／事前生成 ${formatCount(totals.bySource.pregen)}（AIに下書きを作らせた回数）`}
        />
        <KpiCard
          label="採用率"
          value={formatRate(adoption.rate)}
          meaning={`AIの案がそのまま、または編集して送られた割合（成功した ${formatCount(
            totals.success
          )} 回のうち ${formatCount(adoption.adoptedRequests)} 回）`}
        />
        <KpiCard
          label="編集率"
          value={formatRate(adoption.editRate)}
          meaning={`採用された案のうち、本文を書き換えて送られた割合（${formatCount(
            adoption.editedDrafts
          )} / ${formatCount(adoption.adoptedDrafts)} 件）。高いほどAIの文章が現場に合っていません`}
        />
        <KpiCard
          label="失敗率"
          value={formatRate(data.failureRate)}
          tone={data.failureRate !== null && data.failureRate >= 10 ? "warn" : "default"}
          meaning={`生成に失敗した割合（${formatCount(totals.failure)} 回）。高いときは下の失敗一覧を確認してください`}
        />
        <KpiCard
          label="推定コスト（概算）"
          value={`約 ${formatJpy(cost.jpy)}`}
          tone={cost.unpricedModels.length > 0 ? "warn" : "default"}
          meaning={`入力 ${formatCount(cost.inputTokens)}／出力 ${formatCount(
            cost.outputTokens
          )} トークン。使用モデル ${
            cost.models.length > 0 ? cost.models.join("・") : "なし"
          } の単価を 1ドル=${cost.usdJpy}円 で換算した概算で、実際の請求額とは一致しません${
            cost.unpricedModels.length > 0
              ? `。${cost.unpricedModels.join("・")} は単価が未登録のため金額に含まれていません（実際はこの表示より高くなります）。lib/ai-pricing.ts に単価を追加してください`
              : ""
          }`}
        />
      </div>

      {/* 事前生成の効果 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-bold text-stone-800">事前生成は元が取れているか</h2>
        <p className="mt-0.5 text-xs text-stone-500">
          ユーザーからの受信時に裏で作っておく下書きです。使われなかったぶんは費用だけがかかります。
        </p>

        {pregen.success === 0 ? (
          <p className="mt-4 text-sm text-stone-500">
            この期間に成功した事前生成はありません。
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-stone-500">事前に作った下書き</p>
                <p className="mt-1 text-2xl font-black text-stone-800">
                  {formatCount(pregen.success)} 回
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  生成した {formatCount(pregen.total)} 回のうち成功したぶん
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-500">実際に使われた</p>
                <p className="mt-1 text-2xl font-black text-sage">
                  {formatCount(pregen.adopted)} 回
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  採用率 {formatRate(pregen.adoptionRate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-500">使われなかった</p>
                <p className="mt-1 text-2xl font-black text-amber-600">
                  {formatCount(pregen.wasted)} 回
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  事前生成の費用（概算）約 {formatJpy(cost.pregenJpy)}
                </p>
              </div>
            </div>

            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-sage"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((pregen.adopted / pregen.success) * 100)
                  )}%`,
                }}
              />
            </div>

            <p className="mt-3 text-xs leading-relaxed text-stone-600">
              {pregenWastedRate !== null && pregenWastedRate >= 70
                ? `事前に作った下書きの ${pregenWastedRate}% が使われていません。待ち時間の短縮に見合わないなら、事前生成を止めることも検討してください。`
                : `事前に作った下書きの ${100 - (pregenWastedRate ?? 0)}% が使われています。待ち時間ゼロの効果が出ています。`}
            </p>
          </>
        )}
      </section>

      <AiMateTable mates={data.mates} />
      <AiFailureList failures={data.failures} />
    </div>
  );
}
