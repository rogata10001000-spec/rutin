import "server-only";

import type { createAdminSupabaseClient } from "@/lib/supabase/server";
import type { PlanCode } from "@/lib/supabase/types";

// =============================================================
// プラン別のSLA設定（返信目安・警告閾値）の単一の取得口。
//
// これは「設定として保存できる値と、実際に使われる値が別ソースだった」バグの是正。
// 以前は plans テーブル（/admin/plans で編集可）と actions/inbox.ts の
// ハードコードが二重定義されており、SLAを変更すると
//   - SLAアラートcron・SLA違反実績 → 新しい値
//   - 受信トレイのバッジ・優先度   → 古い値のまま
// という乖離が起きた（保存も表示も成功するため気づけない）。
//
// 以後、SLAを読むコードは必ずこの関数を通すこと。
// ハードコードのマップを別ファイルに再定義しない。
// =============================================================

export type PlanSla = { slaMinutes: number; warningMinutes: number };

/**
 * DBが引けないときだけ使う最終フォールバック。
 * 初期マイグレーション（00001_initial_schema.sql）のシード値と揃えている。
 * ここを設定値として使わないこと（あくまで障害時に画面を壊さないための保険）。
 */
const FALLBACK_SLA: Record<string, PlanSla> = {
  light: { slaMinutes: 1440, warningMinutes: 240 },
  standard: { slaMinutes: 720, warningMinutes: 120 },
  premium: { slaMinutes: 120, warningMinutes: 30 },
};

const DEFAULT_PLAN: PlanCode = "standard";

export type PlanSlaMap = {
  /** プランコードからSLA設定を引く（未知のプランは standard 相当へ倒す） */
  get(planCode: string): PlanSla;
};

type AnySupabase = ReturnType<typeof createAdminSupabaseClient>;

/**
 * plans テーブルからSLA設定をまとめて読み込む。
 * 呼び出し側は1リクエストにつき1回だけ呼び、以後は返り値の get() を使う
 * （ユーザーごとにDBを引かない）。
 */
export async function loadPlanSlaMap(supabase: AnySupabase): Promise<PlanSlaMap> {
  const resolved = new Map<string, PlanSla>();

  try {
    const { data } = await supabase
      .from("plans")
      .select("plan_code, reply_sla_minutes, sla_warning_minutes");

    for (const plan of data ?? []) {
      // 0や負値は「未設定」とみなさずそのまま使う（0分＝即時対応の運用もありうる）。
      // null のときだけフォールバックへ倒す。
      if (plan.reply_sla_minutes == null || plan.sla_warning_minutes == null) continue;
      resolved.set(plan.plan_code, {
        slaMinutes: plan.reply_sla_minutes,
        warningMinutes: plan.sla_warning_minutes,
      });
    }
  } catch {
    // DB障害時もフォールバックで表示は保つ（SLA表示のために一覧を落とさない）
  }

  return {
    get(planCode: string): PlanSla {
      return (
        resolved.get(planCode) ??
        resolved.get(DEFAULT_PLAN) ??
        FALLBACK_SLA[planCode] ??
        FALLBACK_SLA[DEFAULT_PLAN]
      );
    },
  };
}
