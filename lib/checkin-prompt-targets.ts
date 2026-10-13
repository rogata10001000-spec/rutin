/**
 * 朝のチェックイン催促の対象選定（純粋関数・単体テスト対象）。
 * 送信本体は lib/checkin-prompts.ts。
 */

export type CheckinPromptCandidate = {
  id: string;
  status: string;
  plan_code: string;
  line_user_id: string | null;
  is_blocked: boolean;
};

/** 催促を送る契約状態。paused（一時停止）と incomplete は送らない */
export const CHECKIN_PROMPT_STATUSES = ["trial", "active", "past_due"] as const;

export function selectCheckinPromptTargets<T extends CheckinPromptCandidate>(
  users: T[],
  enabledPlanCodes: ReadonlySet<string>,
  checkedInTodayIds: ReadonlySet<string>
): T[] {
  return users.filter(
    (u) =>
      (CHECKIN_PROMPT_STATUSES as readonly string[]).includes(u.status) &&
      !u.is_blocked &&
      Boolean(u.line_user_id) &&
      enabledPlanCodes.has(u.plan_code) &&
      !checkedInTodayIds.has(u.id)
  );
}

/** 回答への受け取り確認（reply token＝無料）。人の返信の代わりではなく、報告のハードルを下げる一言 */
export function checkinAckText(status: "circle" | "triangle" | "cross"): string {
  switch (status) {
    case "circle":
      return "◯ を記録しました。今日の様子を一言、教えてください。";
    case "triangle":
      return "△ を記録しました。うまくいかなかったところがあれば、そのまま送ってください。";
    case "cross":
      return "× を記録しました。無理のない範囲で、今日のことを教えてください。";
  }
}
