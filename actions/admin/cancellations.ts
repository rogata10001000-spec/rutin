"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { Result } from "../types";
import type { PlanCode, SubscriptionStatus } from "@/lib/supabase/types";
import { getCurrentJstMonthRange } from "@/lib/date-jst";

export type PendingCancellationItem = {
  subscriptionId: string;
  endUserId: string;
  nickname: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  assignedCastId: string | null;
  assignedCastName: string | null;
  currentPeriodEnd: string | null;
};

export type CancellationSummary = {
  totalCount: number;
  endingThisMonthCount: number;
  planBreakdown: { plan: PlanCode; count: number }[];
};

export type GetPendingCancellationsInput = {
  planCode?: PlanCode;
  assignedCastId?: string;
};

export type GetPendingCancellationsResult = Result<{
  items: PendingCancellationItem[];
  summary: CancellationSummary;
}>;

const ACTIVE_CANCEL_STATUSES: SubscriptionStatus[] = ["trial", "active", "past_due", "paused"];

/**
 * 解約予定（cancel_at_period_end=true）のサブスクリプション一覧
 */
export async function getPendingCancellations(
  input: GetPendingCancellationsInput = {}
): Promise<GetPendingCancellationsResult> {
  const auth = await requireAdminOrSupervisor();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "この操作を行う権限がありません" },
    };
  }

  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("subscriptions")
    .select(`
      id,
      status,
      plan_code,
      current_period_end,
      end_user_id,
      end_users!inner (
        id,
        nickname,
        plan_code,
        status,
        assigned_cast_id,
        staff_profiles!end_users_assigned_cast_id_fkey (
          display_name
        )
      )
    `)
    .eq("cancel_at_period_end", true)
    .in("status", ACTIVE_CANCEL_STATUSES)
    .order("current_period_end", { ascending: true, nullsFirst: false });

  if (input.planCode) {
    query = query.eq("plan_code", input.planCode);
  }

  const { data, error } = await query;

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  const { periodFrom, periodTo } = getCurrentJstMonthRange();
  const planCounts = new Map<PlanCode, number>();
  let endingThisMonthCount = 0;

  const items: PendingCancellationItem[] = [];

  for (const row of data ?? []) {
    const endUser = row.end_users as unknown as {
      id: string;
      nickname: string;
      plan_code: string;
      status: string;
      assigned_cast_id: string | null;
      staff_profiles: { display_name: string } | null;
    };

    if (input.assignedCastId && endUser.assigned_cast_id !== input.assignedCastId) {
      continue;
    }

    const planCode = row.plan_code as PlanCode;
    planCounts.set(planCode, (planCounts.get(planCode) ?? 0) + 1);

    if (row.current_period_end) {
      const endDate = row.current_period_end.slice(0, 10);
      if (endDate >= periodFrom && endDate <= periodTo) {
        endingThisMonthCount += 1;
      }
    }

    items.push({
      subscriptionId: row.id,
      endUserId: endUser.id,
      nickname: endUser.nickname,
      planCode,
      status: row.status as SubscriptionStatus,
      assignedCastId: endUser.assigned_cast_id,
      assignedCastName: endUser.staff_profiles?.display_name ?? null,
      currentPeriodEnd: row.current_period_end,
    });
  }

  const planBreakdown: { plan: PlanCode; count: number }[] = (
    ["light", "standard", "premium"] as PlanCode[]
  )
    .map((plan) => ({ plan, count: planCounts.get(plan) ?? 0 }))
    .filter((p) => p.count > 0);

  return {
    ok: true,
    data: {
      items,
      summary: {
        totalCount: items.length,
        endingThisMonthCount,
        planBreakdown,
      },
    },
  };
}
