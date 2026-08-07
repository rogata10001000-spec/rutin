"use server";

import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { Result } from "../types";
import { sumAiCostUsd, USD_JPY, type TokenUsage } from "@/lib/ai-pricing";

/**
 * AI下書き機能の利用状況（Admin専用）。
 *
 * 「AIの下書きが実際に使われているか・いくらかかっているか」を1画面で判断するための集計。
 *
 * 集計方針:
 * - 件数系（生成回数・成功/失敗・source内訳）は PostgREST の COUNT（head:true）でDB側集計。
 *   期間内の件数がいくら増えても正確な値が出る。
 * - メイト別・トークン量は GROUP BY が PostgREST で表現できないため、
 *   期間内の直近 WINDOW_LIMIT 件だけを取得してJS側で集計する（無制限SELECTはしない）。
 *   取得件数が上限に達した場合は windowTruncated を立てて画面に注記を出す。
 */

/** 期間の選択肢（それ以外の値が来たら既定に丸める）。 */
const ALLOWED_DAYS = [7, 30] as const;
const DEFAULT_DAYS = 7;

/**
 * メイト別・コストの集計に使う取得上限。
 * PostgREST では GROUP BY できないため行を取得してJSで集計する。
 * 全件取得を避けるための境界値で、超えた分は画面に「直近N件で集計」と明示する。
 */
const WINDOW_LIMIT = 5000;

/** 失敗リクエストの表示件数。 */
const FAILURE_LIMIT = 10;


export type AiDraftSource = "manual" | "bulk" | "pregen";

export type AiMateStat = {
  staffId: string;
  displayName: string;
  /** 期間内の生成回数（成功・失敗の合計） */
  generated: number;
  /** そのうち成功した回数 */
  succeeded: number;
  /** 採用された（送信に使われた）リクエスト数 */
  adopted: number;
  /** 採用率（%）。成功0件のときは null */
  adoptionRate: number | null;
  /** 採用された案のうち、編集して送られた割合（%）。採用0件のときは null */
  editRate: number | null;
  /** AIスタイルメモが登録済みか */
  hasStyle: boolean;
  styleUpdatedAt: string | null;
};

export type AiFailureRow = {
  id: string;
  createdAt: string;
  source: AiDraftSource;
  staffName: string;
  message: string;
};

export type AiStats = {
  periodDays: number;
  /** 集計開始日時（ISO） */
  since: string;
  totals: {
    all: number;
    success: number;
    failure: number;
    bySource: Record<AiDraftSource, number>;
  };
  /** 失敗率（%）。0件のときは null */
  failureRate: number | null;
  adoption: {
    /** 採用された（下書きが送信に使われた）リクエスト数 */
    adoptedRequests: number;
    /** 採用率（%）= 採用リクエスト数 / 成功リクエスト数 */
    rate: number | null;
    /** 採用された下書きの件数 */
    adoptedDrafts: number;
    /** そのうち本文を編集して送られた件数 */
    editedDrafts: number;
    /** 編集率（%） */
    editRate: number | null;
  };
  cost: {
    inputTokens: number;
    outputTokens: number;
    usd: number;
    jpy: number;
    /** 事前生成ぶんの概算コスト（円） */
    pregenJpy: number;
    usdJpy: number;
    /** 期間内に実際に使われたモデル名（単価がこれに追従しているかを画面で確認できる） */
    models: string[];
    /** 単価表に無く金額へ含められなかったモデル */
    unpricedModels: string[];
    /** 単価未登録ぶんのトークン数 */
    unpricedTokens: number;
  };
  pregen: {
    total: number;
    success: number;
    adopted: number;
    /** 生成したが採用されなかった件数 */
    wasted: number;
    adoptionRate: number | null;
  };
  mates: AiMateStat[];
  failures: AiFailureRow[];
  /** 直近 windowLimit 件までで集計したか（メイト別・コストの精度に関わる） */
  windowTruncated: boolean;
  windowLimit: number;
};

/** 割合（%・小数第1位まで）。母数0のときは null を返して「—」表示にする。 */
function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function getAiStats(input?: { days?: number }): Promise<Result<AiStats>> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "管理者権限が必要です" } };
  }

  const requested = input?.days ?? DEFAULT_DAYS;
  const periodDays = ALLOWED_DAYS.includes(requested as (typeof ALLOWED_DAYS)[number])
    ? requested
    : DEFAULT_DAYS;
  const since = new Date(Date.now() - periodDays * 86400000).toISOString();

  const supabase = createAdminSupabaseClient();

  // 期間内リクエストの件数系（すべてDB側の COUNT。行は転送しない）
  function baseCountQuery() {
    return supabase
      .from("ai_draft_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
  }

  const [
    totalRes,
    successRes,
    manualRes,
    bulkRes,
    pregenRes,
    pregenSuccessRes,
    windowRes,
    adoptedRes,
    staffRes,
    failuresRes,
  ] = await Promise.all([
    // 1) 生成回数（全体）
    baseCountQuery(),
    // 2) 成功した回数
    baseCountQuery().eq("success", true),
    // 3-5) source別の内訳
    baseCountQuery().eq("source", "manual"),
    baseCountQuery().eq("source", "bulk"),
    baseCountQuery().eq("source", "pregen"),
    // 6) 事前生成のうち成功したもの（採用率の母数）
    baseCountQuery().eq("source", "pregen").eq("success", true),
    // 7) メイト別・トークン量の集計用（期間内の直近 WINDOW_LIMIT 件）
    supabase
      .from("ai_draft_requests")
      .select("id, requested_by, source, success, input_tokens, output_tokens, model")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(WINDOW_LIMIT),
    // 8) 採用された下書き（期間の判定は「生成された日時」で行う。
    //    ai_draft_requests を !inner で内部結合し、DB側で期間と採用有無を絞る）
    supabase
      .from("ai_drafts")
      .select("request_id, body, sent_body, ai_draft_requests!inner(requested_by, source, created_at)")
      .not("selected_at", "is", null)
      .gte("ai_draft_requests.created_at", since)
      .order("selected_at", { ascending: false })
      .limit(WINDOW_LIMIT),
    // 9) メイト名・スタイルメモ（表示用マスタ）
    supabase
      .from("staff_profiles")
      .select("id, display_name, style_summary, style_updated_at")
      .limit(500),
    // 10) 直近の失敗（設定ミス・クォータ切れに気づくため）
    supabase
      .from("ai_draft_requests")
      .select("id, created_at, source, requested_by, error_message")
      .eq("success", false)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(FAILURE_LIMIT),
  ]);

  const firstError =
    totalRes.error ??
    successRes.error ??
    manualRes.error ??
    bulkRes.error ??
    pregenRes.error ??
    pregenSuccessRes.error ??
    windowRes.error ??
    adoptedRes.error ??
    staffRes.error ??
    failuresRes.error;

  if (firstError) {
    return { ok: false, error: { code: "UNKNOWN", message: "利用状況を取得できませんでした" } };
  }

  const total = totalRes.count ?? 0;
  const success = successRes.count ?? 0;
  const failure = Math.max(0, total - success);

  const staffMap = new Map(
    (staffRes.data ?? []).map((s) => [
      s.id,
      {
        displayName: s.display_name,
        hasStyle: !!s.style_summary,
        styleUpdatedAt: s.style_updated_at,
      },
    ])
  );

  // --- 直近ウィンドウからメイト別・トークン量を集計 ---
  const windowRows = windowRes.data ?? [];
  const windowTruncated = windowRows.length >= WINDOW_LIMIT;

  let inputTokens = 0;
  let outputTokens = 0;
  // コストはモデル別に集計する（期間中にモデルを切り替えても正しい金額になる）
  const usageByModel = new Map<string, TokenUsage>();
  const pregenUsageByModel = new Map<string, TokenUsage>();
  const addUsage = (map: Map<string, TokenUsage>, model: string, inTok: number, outTok: number) => {
    const cur = map.get(model) ?? { inputTokens: 0, outputTokens: 0 };
    cur.inputTokens += inTok;
    cur.outputTokens += outTok;
    map.set(model, cur);
  };

  type MateAccumulator = { generated: number; succeeded: number; adopted: number; adoptedDrafts: number; editedDrafts: number };
  const mateAcc = new Map<string, MateAccumulator>();
  const ensureMate = (staffId: string): MateAccumulator => {
    let acc = mateAcc.get(staffId);
    if (!acc) {
      acc = { generated: 0, succeeded: 0, adopted: 0, adoptedDrafts: 0, editedDrafts: 0 };
      mateAcc.set(staffId, acc);
    }
    return acc;
  };

  for (const row of windowRows) {
    const acc = ensureMate(row.requested_by);
    acc.generated += 1;
    if (row.success) acc.succeeded += 1;

    const inTok = row.input_tokens ?? 0;
    const outTok = row.output_tokens ?? 0;
    inputTokens += inTok;
    outputTokens += outTok;
    if (inTok > 0 || outTok > 0) {
      // model が未記録の古い行は "(不明)" として単価未登録に倒す（0円で紛れ込ませない）
      const model = row.model ?? "(不明)";
      addUsage(usageByModel, model, inTok, outTok);
      if (row.source === "pregen") addUsage(pregenUsageByModel, model, inTok, outTok);
    }
  }

  // --- 採用された下書きから採用率・編集率を集計 ---
  type AdoptedRow = {
    request_id: string;
    body: string;
    sent_body: string | null;
    ai_draft_requests: unknown;
  };
  const adoptedRows = (adoptedRes.data ?? []) as unknown as AdoptedRow[];

  const adoptedRequestIds = new Set<string>();
  const pregenAdoptedRequestIds = new Set<string>();
  const mateAdoptedRequestIds = new Map<string, Set<string>>();
  let adoptedDrafts = 0;
  let editedDrafts = 0;

  for (const row of adoptedRows) {
    // PostgREST の埋め込みはテーブル名がそのままレスポンスのキーになる
    const request = row.ai_draft_requests as unknown as {
      requested_by: string;
      source: AiDraftSource;
      created_at: string;
    } | null;
    if (!request) continue;

    adoptedDrafts += 1;
    adoptedRequestIds.add(row.request_id);
    if (request.source === "pregen") {
      pregenAdoptedRequestIds.add(row.request_id);
    }

    // 送信本文が案と違えば「編集して送った」とみなす。
    // sent_body が null（採用トラッキング導入前・記録失敗）は編集なし側に数える。
    const edited = row.sent_body !== null && row.sent_body.trim() !== row.body.trim();
    if (edited) editedDrafts += 1;

    let set = mateAdoptedRequestIds.get(request.requested_by);
    if (!set) {
      set = new Set<string>();
      mateAdoptedRequestIds.set(request.requested_by, set);
    }
    set.add(row.request_id);

    const acc = ensureMate(request.requested_by);
    acc.adoptedDrafts += 1;
    if (edited) acc.editedDrafts += 1;
  }

  for (const [staffId, ids] of mateAdoptedRequestIds) {
    ensureMate(staffId).adopted = ids.size;
  }

  const mates: AiMateStat[] = [...mateAcc.entries()]
    .map(([staffId, acc]) => {
      const staff = staffMap.get(staffId);
      return {
        staffId,
        displayName: staff?.displayName ?? "退職・削除済み",
        generated: acc.generated,
        succeeded: acc.succeeded,
        adopted: acc.adopted,
        adoptionRate: pct(acc.adopted, acc.succeeded),
        editRate: pct(acc.editedDrafts, acc.adoptedDrafts),
        hasStyle: staff?.hasStyle ?? false,
        styleUpdatedAt: staff?.styleUpdatedAt ?? null,
      };
    })
    .sort((a, b) => b.generated - a.generated || a.displayName.localeCompare(b.displayName, "ja"));

  // --- コスト（概算） ---
  // 単価はモデル名（ai_draft_requests.model）から引く。
  // AI_MODEL を上位モデルへ変えても金額表示が旧単価のまま残らない。
  const costAll = sumAiCostUsd(usageByModel);
  const usd = costAll.usd;
  const pregenUsd = sumAiCostUsd(pregenUsageByModel).usd;

  const pregenTotal = pregenRes.count ?? 0;
  const pregenSuccess = pregenSuccessRes.count ?? 0;
  const pregenAdopted = pregenAdoptedRequestIds.size;

  const failures: AiFailureRow[] = (failuresRes.data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    staffName: staffMap.get(row.requested_by)?.displayName ?? "不明",
    message: row.error_message ?? "エラー内容が記録されていません",
  }));

  return {
    ok: true,
    data: {
      periodDays,
      since,
      totals: {
        all: total,
        success,
        failure,
        bySource: {
          manual: manualRes.count ?? 0,
          bulk: bulkRes.count ?? 0,
          pregen: pregenTotal,
        },
      },
      failureRate: pct(failure, total),
      adoption: {
        adoptedRequests: adoptedRequestIds.size,
        rate: pct(adoptedRequestIds.size, success),
        adoptedDrafts,
        editedDrafts,
        editRate: pct(editedDrafts, adoptedDrafts),
      },
      cost: {
        inputTokens,
        outputTokens,
        usd,
        jpy: usd * USD_JPY,
        pregenJpy: pregenUsd * USD_JPY,
        usdJpy: USD_JPY,
        models: [...usageByModel.keys()].sort(),
        unpricedModels: costAll.unpricedModels,
        unpricedTokens: costAll.unpricedTokens,
      },
      pregen: {
        total: pregenTotal,
        success: pregenSuccess,
        adopted: pregenAdopted,
        wasted: Math.max(0, pregenSuccess - pregenAdopted),
        adoptionRate: pct(pregenAdopted, pregenSuccess),
      },
      mates,
      failures,
      windowTruncated,
      windowLimit: WINDOW_LIMIT,
    },
  };
}
