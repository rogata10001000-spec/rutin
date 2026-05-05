"use server";

import { getCurrentStaff } from "@/lib/auth";
import { getWebPushPublicKey, isWebPushConfigured } from "@/lib/push-notifications";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import type { Result } from "@/actions/types";
import { toZodErrorMessage } from "@/actions/types";
import {
  pushSubscriptionEndpointSchema,
  pushSubscriptionSchema,
} from "@/schemas/push-notifications";

type PushConfig = {
  publicKey: string | null;
  enabled: boolean;
};

export async function getPushNotificationConfig(): Promise<Result<PushConfig>> {
  try {
    const staff = await getCurrentStaff();

    if (!staff) {
      return { ok: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です" } };
    }

    const publicKey = getWebPushPublicKey();
    return { ok: true, data: { publicKey, enabled: isWebPushConfigured() } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "通知設定の取得に失敗しました",
      },
    };
  }
}

export async function registerPushSubscription(
  input: unknown
): Promise<Result<{ subscriptionId: string }>> {
  try {
    const staff = await getCurrentStaff();

    if (!staff) {
      return { ok: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です" } };
    }

    const parsed = pushSubscriptionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
      };
    }

    const supabase = createAdminSupabaseClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("staff_push_subscriptions")
      .upsert(
        {
          staff_id: staff.id,
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.p256dh,
          auth: parsed.data.auth,
          user_agent: parsed.data.userAgent ?? null,
          platform: parsed.data.platform ?? null,
          enabled: true,
          last_seen_at: now,
        },
        { onConflict: "endpoint" }
      )
      .select("id")
      .single();

    if (error) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: `通知購読の保存に失敗しました: ${error.message}` },
      };
    }

    return { ok: true, data: { subscriptionId: data.id } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "通知購読の保存に失敗しました",
      },
    };
  }
}

export async function unregisterPushSubscription(input: unknown): Promise<Result<undefined>> {
  try {
    const staff = await getCurrentStaff();

    if (!staff) {
      return { ok: false, error: { code: "UNAUTHORIZED", message: "ログインが必要です" } };
    }

    const parsed = pushSubscriptionEndpointSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: "ZOD_ERROR", message: toZodErrorMessage(parsed.error.issues[0]?.message) },
      };
    }

    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from("staff_push_subscriptions")
      .update({ enabled: false, last_seen_at: new Date().toISOString() })
      .eq("staff_id", staff.id)
      .eq("endpoint", parsed.data.endpoint);

    if (error) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: `通知解除に失敗しました: ${error.message}` },
      };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "通知解除に失敗しました",
      },
    };
  }
}
