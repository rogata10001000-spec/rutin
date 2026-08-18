import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 「設定したのに反映されない」バグの再発防止テスト。
 *
 * 個々の値ではなく、バグを生む**構造**を検査する:
 *  P1 設定値の二重定義（DBに保存できるのに消費側がハードコードを見る）
 *  P2 空文字の意味が保存側と消費側でズレる
 *  P4 書ける/読めるの非対称（設定できるのにどこからも読まれない）
 *
 * これらは「保存も表示も成功する」ため手動テストで見つからない。
 */

const ROOT = join(__dirname, "..", "..");

function collectSourceFiles(dirs: string[]): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      // 自動生成の型定義はDBスキーマの写しなので検査対象外
      if (entry === "types.ts" && dir.endsWith("supabase")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) files.push(full);
    }
  };
  dirs.forEach((d) => walk(join(ROOT, d)));
  return files;
}

const SOURCE_FILES = collectSourceFiles(["actions", "lib", "app", "components"]);

function read(file: string): string {
  return readFileSync(file, "utf8");
}

describe("P1: 設定値の二重定義がないこと", () => {
  it("SLA設定はハードコードのマップを持たない（plansテーブルが唯一の設定源）", () => {
    // 「light: { slaMinutes: ... }」の形でプラン別SLAを直書きしているファイルを検出する。
    // 過去、受信トレイがこれを持っていたため /admin/plans での変更が反映されなかった。
    const offenders = SOURCE_FILES.filter((f) => {
      if (f.endsWith("lib/plan-sla.ts")) return false; // フォールバック定義のみ許可
      return /slaMinutes:\s*\d+/.test(read(f));
    }).map((f) => f.replace(ROOT + "/", ""));

    expect(offenders).toEqual([]);
  });

  it("SLAを読む箇所は共通ヘルパー経由（plansを直接引く実装を増やさない）", () => {
    const direct = SOURCE_FILES.filter((f) => {
      if (f.endsWith("lib/plan-sla.ts")) return false;
      const src = read(f);
      return src.includes("reply_sla_minutes") && !src.includes("loadPlanSlaMap");
    })
      .map((f) => f.replace(ROOT + "/", ""))
      // 管理画面の編集・表示はDBの生値を扱うため対象外
      .filter((f) => !f.startsWith("actions/admin/plans.ts"))
      .filter((f) => !f.startsWith("components/admin/plans/"));

    expect(direct).toEqual([]);
  });
});

describe("P2: 空文字の意味が消費側で勝手に潰されないこと", () => {
  it("funnel_copy の解決で空文字を未設定扱いしていない", () => {
    const src = read(join(ROOT, "lib/funnel-copy.ts"));
    // `resolved !== ""` があると「空にして消す」ができなくなる
    expect(src).not.toMatch(/resolved\s*!==\s*""/);
  });

  it("空にできるキーは emptiable で明示されている（ボタン等を空にできない）", async () => {
    const { FUNNEL_COPY_DEFS } = await import("@/lib/funnel-copy-defs");
    const emptiable = FUNNEL_COPY_DEFS.filter((d) => d.emptiable).map((d) => d.key);
    // 消せると困るもの（押せないボタン・読めない見出し）が混ざっていないこと
    expect(emptiable).not.toContain("detail.cta");
    expect(emptiable).not.toContain("plan.cta.trial");
    expect(emptiable).not.toContain("cast.nav.title");
    // 案内バナーは消せること（運用上「出さない」選択が要る）
    expect(emptiable).toContain("cast.banner.canceled.title");
  });
});

describe("P3: 価格の解決ロジックが分裂していないこと", () => {
  it("Stripe価格IDの解決は共通ヘルパー経由（オーバーライドだけを見る実装を作らない）", () => {
    const offenders = SOURCE_FILES.filter((f) => {
      const src = read(f);
      if (!src.includes("cast_plan_price_overrides")) return false;
      // 価格解決の正規実装と、オーバーライド自体を編集する管理画面は対象外
      if (f.endsWith("lib/plan-pricing.ts")) return false;
      if (f.endsWith("actions/admin/pricing.ts")) return false;
      if (f.endsWith("actions/subscriptions.ts")) return false;
      return true;
    }).map((f) => f.replace(ROOT + "/", ""));

    expect(offenders).toEqual([]);
  });

  it("完了画面はハードコード価格表をフォールバックに使わない", () => {
    const src = read(join(ROOT, "app/subscribe/complete/page.tsx"));
    expect(src).not.toContain("DEFAULT_PLAN_PRICES");
    expect(src).not.toContain("DEFAULT_ANNUAL_PRICES");
  });
});

describe("P4: 書ける/読めるの非対称がないこと", () => {
  it("LIFF IDは管理画面から設定できない（実際は環境変数を使うため）", () => {
    const dialog = read(
      join(ROOT, "components/admin/line-accounts/UpsertLineAccountDialog.tsx")
    );
    expect(dialog).not.toContain("liffId");
  });

  it("配分ルールの終了日は書き込み経路がある（読むだけの列を残さない）", () => {
    const action = read(join(ROOT, "actions/admin/payout-rules.ts"));
    expect(action).toContain("effective_to");
    const form = read(join(ROOT, "components/admin/payout-rules/PayoutRuleForm.tsx"));
    expect(form).toContain("effectiveTo");
  });

  it("リッチメニューは共通アカウント限定で潰されない（メイト別でも設定できる）", () => {
    const dialog = read(
      join(ROOT, "components/admin/line-accounts/UpsertLineAccountDialog.tsx")
    );
    expect(dialog).not.toMatch(/richMenuUncontractedId:\s*data\.isDefault/);
  });
});

describe("P5: 表示名・単価・単位の定義が分裂していないこと", () => {
  it("プラン表示名のラベルマップを各ファイルが独自に持たない", () => {
    // 過去、light/standard/premium のラベルが13箇所に散在し、
    // /admin/preview で改名してもLINE通知・管理画面が旧名のまま残っていた。
    const offenders = SOURCE_FILES.filter((f) => {
      if (f.endsWith("lib/plan-labels.ts")) return false; // 唯一の定義元
      const src = read(f);
      return /light:\s*"(Light|ライト)"/.test(src) || /value:\s*"light",\s*label:\s*"Light"/.test(src);
    }).map((f) => f.replace(ROOT + "/", ""));

    expect(offenders).toEqual([]);
  });

  it("プラン表示名は funnel_copy の設定値から解決できる", async () => {
    const src = read(join(ROOT, "lib/funnel-copy.ts"));
    expect(src).toContain("export async function resolvePlanLabels");
    // 通知文（外部に出る文言）が設定値を見ていること
    expect(read(join(ROOT, "lib/operator-notifications.ts"))).toContain("resolvePlanLabels");
  });

  it("AI費用の単価はモデル名から引く（1モデル固定の定数を持たない）", () => {
    const src = read(join(ROOT, "actions/admin/ai-stats.ts"));
    // モデルを変えると過少表示になるハードコード単価が復活していないこと
    expect(src).not.toMatch(/USD_PER_MTOK_(INPUT|OUTPUT)\s*=/);
    expect(src).toContain("sumAiCostUsd");
    // 実際に使われたモデル名で単価を引いていること
    expect(src).toContain("row.model");
  });

  it("AI費用の画面は単価未登録モデルを黙って0円にしない", () => {
    const dashboard = read(join(ROOT, "components/admin/ai-stats/AiStatsDashboard.tsx"));
    expect(dashboard).toContain("unpricedModels");
    // 特定モデル名を文言に直書きしない（モデル変更で説明文だけ古くなる）
    expect(dashboard).not.toContain("Claude Haiku 4.5の単価");
  });

  it("売上・マーケの金額表示は税込/税抜を明記する", () => {
    const forecast = read(join(ROOT, "components/admin/revenue/RevenueForecastTable.tsx"));
    expect(forecast).toContain("税込");
    const marketing = read(join(ROOT, "components/admin/marketing/MarketingDashboard.tsx"));
    expect(marketing).toContain("税込");
  });
});

describe("P6: 複数メイト対応後の単一行前提が再発しないこと", () => {
  it("end_users を line_user_id 単独で single/maybeSingle しない", () => {
    // 複数メイト契約では同じUIDに関係行が複数ある。
    // .eq("line_user_id", ...).single() は2行目ができた瞬間にエラーになり、
    // エラー破棄と組み合わさると「ユーザーが見つかりません」やセッション縮退として
    // 静かに壊れる。UIDからの解決は lib/person.ts を通すこと。
    const offenders: string[] = [];
    for (const f of SOURCE_FILES) {
      if (f.endsWith("lib/person.ts")) continue;
      const src = read(f);
      // from("end_users") ... eq("line_user_id" ... single()/maybeSingle() の連なりを検出
      const chainRe =
        /from\("end_users"\)[\s\S]{0,200}?\.eq\("line_user_id"[\s\S]{0,120}?\.(?:maybeSingle|single)\(\)/g;
      if (chainRe.test(src)) {
        offenders.push(f.replace(ROOT + "/", ""));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("見込み行の昇格は0件更新を検出する（select確認付き）", () => {
    // 並行する別メイトの決済が先に昇格させると0件更新になり、
    // エラーにならないため「昇格できたつもり」で別メイトの行を返してしまう
    const src = read(join(ROOT, "lib/person.ts"));
    expect(src).toMatch(/\.is\("assigned_cast_id", null\)\s*\n\s*\.select\("id"\)/);
  });
});
