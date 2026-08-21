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

describe("P7: 人単位の資源を行単位で書かないこと（集約レベルの取り違え）", () => {
  it("ブロックは人の全行へ反映する（1行だけのブロックは非対称を生む）", () => {
    const src = read(join(ROOT, "actions/users.ts"));
    const blockSection = src.slice(src.indexOf("setEndUserBlocked"));
    // ブロック更新が person_id 基準であること
    expect(blockSection).toMatch(/is_blocked[\s\S]{0,300}\.eq\("person_id"/);
  });

  it("LINEプロフィール同期は同じUIDの全行へ反映する", () => {
    const src = read(join(ROOT, "lib/line-onboarding.ts"));
    const syncSection = src.slice(src.indexOf("syncLineProfileToEndUser"));
    expect(syncSection).toMatch(/line_display_name[\s\S]{0,400}\.eq\("line_user_id", lineUserId\)/);
  });

  it("契約者への追加契約案内は message と follow の両経路にある", () => {
    // 片方だけだと「友だち追加の瞬間だけ新規向けwelcomeが届く」取りこぼしになる
    const src = read(join(ROOT, "lib/line-webhook-handler.ts"));
    const calls = src.match(/replyAddMateGuide\(supabase, account/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("ステップ配信は人単位のライブ契約で契約者を除外している", () => {
    const src = read(join(ROOT, "lib/line-step-delivery.ts"));
    expect(src).toContain("contractedPersonIds");
    expect(src).toMatch(/\.in\("status", \["trial", "active", "past_due", "paused"\]\)/);
  });
});

describe("P8: 外部イベント処理の無音故障を作らないこと", () => {
  it("invoiceのサブスクID解決は新旧両形対応のリーダー関数に集約されている", () => {
    // Stripe APIバージョン(basil/clover)で invoice.subscription が
    // parent.subscription_details.subscription へ移動した。旧形だけ読むと
    // 全invoice.paidが無音skipになり売上記録が全欠落する（実際に起きた）。
    const src = read(join(ROOT, "app/api/webhooks/stripe/route.ts"));
    const reader = src.slice(
      src.indexOf("function subscriptionIdFromInvoice"),
      src.indexOf("function subscriptionIdFromInvoice") + 1500
    );
    expect(reader).toContain("subscription_details");
    expect(reader).toMatch(/raw\.subscription|legacy/);
  });

  it("売上が記録されないskipは error ログで可視化されている（無音skip禁止）", () => {
    const src = read(join(ROOT, "app/api/webhooks/stripe/route.ts"));
    const matches = src.match(/revenue NOT recorded/g) ?? [];
    // 解決不能・行なし・担当なし・税率なし・配分ルールなし の5箇所
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  it("契約行の新規作成フォールバックは作成イベント以外にも開かれている（到着順逆転対策）", () => {
    const src = read(join(ROOT, "app/api/webhooks/stripe/route.ts"));
    // 「created 以外なら skip」の早期return が復活していないこと
    expect(src).not.toMatch(
      /eventType !== "customer\.subscription\.created"\)\s*\{\s*\n\s*logger\.warn\("stripe webhook: subscription not found"/
    );
    // 新規作成時は現在状態を fetch していること
    expect(src).toMatch(/fetchStripeSubscription\(subscriptionId\)/);
  });

  it("LINE Webhook設定の実測突合とワンタップ修復が管理画面に配線されている", () => {
    const action = read(join(ROOT, "actions/admin/line-accounts.ts"));
    expect(action).toContain("getLineWebhookHealth");
    expect(action).toContain("repairLineWebhookEndpoint");
    const page = read(join(ROOT, "app/(admin)/admin/line-accounts/page.tsx"));
    expect(page).toContain("LineWebhookHealthSection");
  });
});

describe("P9: 時間窓ジョブのバックフィル耐性と表示の誤解防止", () => {
  it("日次ロールアップは日付指定で再実行できる（上流修復後のバックフィル手段）", () => {
    const src = read(join(ROOT, "app/api/jobs/daily-metrics-rollup/route.ts"));
    expect(src).toContain('searchParams.get("date")');
    expect(src).toContain("runDailyMetricsRollup(dateParam");
  });

  it("月次精算は取り残し（前月より古い未精算配分）を検知する", () => {
    const src = read(join(ROOT, "app/api/jobs/monthly-settlement/route.ts"));
    expect(src).toContain("stranded");
    expect(src).toMatch(/\.is\("settlement_batch_id", null\)/);
  });

  it("開発メモ的文言（参考実装・仮実装）が本番UIに残っていない", () => {
    const offenders = SOURCE_FILES.filter((f) => {
      if (!/\.(tsx)$/.test(f)) return false;
      const src = read(f);
      return /参考実装|仮実装/.test(src);
    }).map((f) => f.replace(ROOT + "/", ""));
    expect(offenders).toEqual([]);
  });

  it("周期イベントの一覧には「期間内に発生した分のみ」の説明がある", () => {
    const page = read(join(ROOT, "app/(admin)/admin/revenue/page.tsx"));
    expect(page).toContain("表示期間内に請求が発生したメイトのみ");
  });
});

describe("P10: ポイント残高は人単位・枠警告は表示と通知で同じ判定", () => {
  it("ポイント残高の集計が end_user_id 単独で行われていない（personで分裂しない）", () => {
    // 複数メイト契約では end_users は「人×メイトの関係行」。
    // 行単位で残高を集計すると関係行ごとに残高が分裂する。
    const offenders = SOURCE_FILES.filter((f) => {
      const src = read(f);
      // ledger を end_user_id で絞って delta_points を集計するパターンを検出
      return /user_point_ledger[\s\S]{0,200}\.eq\("end_user_id"/.test(src);
    }).map((f) => f.replace(ROOT + "/", ""));
    expect(offenders).toEqual([]);
  });

  it("LINE枠の警告は日次サマリーから運営通知に配線されている", () => {
    const src = read(join(ROOT, "app/api/jobs/daily-summary/route.ts"));
    expect(src).toContain("getLineAccountQuotaAlerts");
    // 同日重複の1回制御（claim）があること
    expect(src).toContain("quota-alert:");
  });

  it("枠警告の判定は表示と通知で同じ関数を使う（基準のズレ防止）", () => {
    const alerts = read(join(ROOT, "lib/line-quota-alerts.ts"));
    expect(alerts).toContain("assessLineQuota");
  });
});

describe("P11: 表示だけの監視を作らない・完了済み指示コメントを残さない", () => {
  it("Webhook接続の異常は日次サマリーから運営通知に配線されている", () => {
    // 接続ずれは「会員のメッセージが痕跡なく消える」無音の全損。
    // 管理画面の表示だけでは、画面を開かない限り気づけない。
    const src = read(join(ROOT, "app/api/jobs/daily-summary/route.ts"));
    expect(src).toContain("auditLineWebhookEndpoints");
    expect(src).toContain("webhook-health-alert:");
  });

  it("Webhook接続の判定は表示と通知で同じ関数を共有している", () => {
    // 別実装だと「画面は赤いのに通知が来ない」ズレが生まれる
    const action = read(join(ROOT, "actions/admin/line-accounts.ts"));
    expect(action).toContain("auditAllLineWebhookEndpoints");
    const audit = read(join(ROOT, "lib/line-webhook-audit.ts"));
    expect(audit).toContain("buildLineWebhookUrl");
  });

  it("完了済みの移行指示コメントが残っていない", () => {
    // 「〜すること」型の指示コメントは完了後に残ると二重対応を誘発する
    const offenders = SOURCE_FILES.filter((f) => {
      const src = read(f);
      return /person_id 参照へ移行すること/.test(src);
    }).map((f) => f.replace(ROOT + "/", ""));
    expect(offenders).toEqual([]);
  });
});
