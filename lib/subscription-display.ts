import { format } from "date-fns";

export type RenewalInfoKind = "trial_end" | "cancel_at" | "renewal" | "none";

export type RenewalInfo = {
  kind: RenewalInfoKind;
  /** 対象日（ISO文字列）。none のときは null。 */
  date: string | null;
  /** 表示ラベル（「トライアル終了」「解約予定」「次回更新」）。none のときは空。 */
  label: string;
};

const ACTIVE_STATUSES = new Set(["active", "past_due", "paused"]);

/**
 * 契約状態から「いつが更新日／終了日か」を一意に解決する。
 * 一覧・チャット右パネル・詳細で表示を統一するための共通ロジック。
 * 優先順位: トライアル中→トライアル終了 / 解約予定→解約予定日 / 契約中→次回更新。
 */
export function getRenewalInfo(params: {
  status: string;
  trialEndAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}): RenewalInfo {
  const { status, trialEndAt, currentPeriodEnd, cancelAtPeriodEnd } = params;

  if (status === "trial") {
    const date = trialEndAt ?? currentPeriodEnd;
    return date
      ? { kind: "trial_end", date, label: "トライアル終了" }
      : { kind: "none", date: null, label: "" };
  }

  if (cancelAtPeriodEnd && currentPeriodEnd) {
    return { kind: "cancel_at", date: currentPeriodEnd, label: "解約予定" };
  }

  if (currentPeriodEnd && ACTIVE_STATUSES.has(status)) {
    return { kind: "renewal", date: currentPeriodEnd, label: "次回更新" };
  }

  return { kind: "none", date: null, label: "" };
}

/** 更新日／終了日のフォーマット（無効・未設定は "-"）。 */
export function formatRenewalDate(iso: string | null, pattern = "yyyy/MM/dd"): string {
  if (!iso) return "-";
  try {
    return format(new Date(iso), pattern);
  } catch {
    return "-";
  }
}
