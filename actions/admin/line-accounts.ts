"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Result } from "../types";
import { writeAuditLog } from "@/lib/audit";
import { getServerEnv } from "@/lib/env";
import { encryptSecret, isTokenEncryptionConfigured } from "@/lib/crypto";
import { invalidateLineAccountCache } from "@/lib/line-accounts";
import {
  upsertLineAccountSchema,
  type UpsertLineAccountInput,
} from "@/schemas/line-accounts";
import { buildLineWebhookUrl } from "@/lib/line-webhook-audit";

export type LineAccountListItem = {
  id: string;
  castId: string | null;
  castName: string | null;
  isDefault: boolean;
  name: string;
  channelId: string | null;
  botUserId: string | null;
  hasChannelSecret: boolean;
  hasAccessToken: boolean;
  liffId: string | null;
  richMenuUncontractedId: string | null;
  richMenuContractedId: string | null;
  friendAddUrl: string | null;
  active: boolean;
  webhookUrl: string;
};

export type CastOptionItem = {
  id: string;
  displayName: string;
};

export type GetLineAccountsResult = Result<{
  items: LineAccountListItem[];
  castOptions: CastOptionItem[];
  encryptionConfigured: boolean;
}>;

function buildWebhookUrl(id: string): string {
  // 正規の組み立ては lib/line-webhook-audit.ts に一本化（表示・通知・修復で同じURL）
  return buildLineWebhookUrl(id);
}

/**
 * LINE公式アカウント一覧取得（token類はマスクし、設定有無のみ返す）
 * 権限: Admin のみ
 */
export async function getLineAccounts(): Promise<GetLineAccountsResult> {
  const auth = await requireAdmin();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "LINE公式アカウント管理はAdminのみ可能です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: accounts, error } = await supabase
    .from("line_official_accounts")
    .select(
      "id, cast_id, is_default, name, channel_id, bot_user_id, channel_secret_encrypted, channel_access_token_encrypted, liff_id, rich_menu_uncontracted_id, rich_menu_contracted_id, friend_add_url, active, staff_profiles!line_official_accounts_cast_id_fkey(display_name)"
    )
    .order("is_default", { ascending: false })
    .order("name");

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "データの取得に失敗しました" },
    };
  }

  const { data: casts } = await supabase
    .from("staff_profiles")
    .select("id, display_name")
    .eq("role", "cast")
    .eq("active", true)
    .order("display_name");

  const items: LineAccountListItem[] = (accounts ?? []).map((a) => ({
    id: a.id,
    castId: a.cast_id,
    castName:
      (a.staff_profiles as unknown as { display_name: string } | null)?.display_name ?? null,
    isDefault: a.is_default,
    name: a.name,
    channelId: a.channel_id,
    botUserId: a.bot_user_id,
    hasChannelSecret: Boolean(a.channel_secret_encrypted),
    hasAccessToken: Boolean(a.channel_access_token_encrypted),
    liffId: a.liff_id,
    richMenuUncontractedId: a.rich_menu_uncontracted_id,
    richMenuContractedId: a.rich_menu_contracted_id,
    friendAddUrl: a.friend_add_url,
    active: a.active,
    webhookUrl: buildWebhookUrl(a.id),
  }));

  const castOptions: CastOptionItem[] = (casts ?? []).map((c) => ({
    id: c.id,
    displayName: c.display_name,
  }));

  return {
    ok: true,
    data: { items, castOptions, encryptionConfigured: isTokenEncryptionConfigured() },
  };
}

export type UpsertLineAccountResult = Result<{ id: string }>;

function mapUpsertError(message: string): string {
  if (message.includes("idx_line_official_accounts_cast_active")) {
    return "このメイトには既に有効なLINEアカウントが登録されています";
  }
  if (message.includes("idx_line_official_accounts_default")) {
    return "有効なデフォルト(共通)アカウントは1件のみ登録できます";
  }
  if (message.includes("idx_line_official_accounts_bot_user_id")) {
    return "このボットユーザーIDは既に他のアカウントで使われています";
  }
  return "保存に失敗しました";
}

/**
 * LINE公式アカウント作成/更新
 * 権限: Admin のみ
 */
export async function upsertLineAccount(
  input: UpsertLineAccountInput
): Promise<UpsertLineAccountResult> {
  const auth = await requireAdmin();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "LINE公式アカウント管理はAdminのみ可能です" },
    };
  }

  const parsed = upsertLineAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "ZOD_ERROR",
        message: parsed.error.errors[0]?.message ?? "入力内容を確認してください",
      },
    };
  }

  const data = parsed.data;

  // token/secret を新規入力する場合は暗号化鍵が必須
  if ((data.channelSecret || data.channelAccessToken) && !isTokenEncryptionConfigured()) {
    return {
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message:
          "暗号化鍵(LINE_TOKEN_ENC_KEY)が未設定です。token/secretを保存できません。",
      },
    };
  }

  // 共通アカウントは cast を持たない
  const castId = data.isDefault ? null : data.castId;

  const baseValues = {
    cast_id: castId,
    is_default: data.isDefault,
    name: data.name,
    channel_id: data.channelId ?? null,
    bot_user_id: data.botUserId ?? null,
    liff_id: data.liffId ?? null,
    rich_menu_uncontracted_id: data.richMenuUncontractedId ?? null,
    rich_menu_contracted_id: data.richMenuContractedId ?? null,
    friend_add_url: data.friendAddUrl ?? null,
    active: data.active,
    ...(data.channelSecret
      ? { channel_secret_encrypted: encryptSecret(data.channelSecret) }
      : {}),
    ...(data.channelAccessToken
      ? { channel_access_token_encrypted: encryptSecret(data.channelAccessToken) }
      : {}),
  };

  const supabase = await createServerSupabaseClient();

  let resultId: string;
  let action: "LINE_ACCOUNT_CREATE" | "LINE_ACCOUNT_UPDATE";

  if (data.id) {
    const { data: updated, error } = await supabase
      .from("line_official_accounts")
      .update(baseValues)
      .eq("id", data.id)
      .select("id")
      .single();

    if (error || !updated) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: mapUpsertError(error?.message ?? "") },
      };
    }

    resultId = updated.id;
    action = "LINE_ACCOUNT_UPDATE";
  } else {
    const { data: created, error } = await supabase
      .from("line_official_accounts")
      .insert(baseValues)
      .select("id")
      .single();

    if (error || !created) {
      return {
        ok: false,
        error: { code: "UNKNOWN", message: mapUpsertError(error?.message ?? "") },
      };
    }

    resultId = created.id;
    action = "LINE_ACCOUNT_CREATE";
  }

  invalidateLineAccountCache();

  await writeAuditLog({
    action,
    targetType: "line_official_accounts",
    targetId: resultId,
    success: true,
    metadata: {
      cast_id: castId,
      is_default: data.isDefault,
      name: data.name,
      active: data.active,
      secret_updated: Boolean(data.channelSecret),
      token_updated: Boolean(data.channelAccessToken),
    },
  });

  revalidatePath("/admin/line-accounts");

  return { ok: true, data: { id: resultId } };
}

export type ToggleLineAccountActiveResult = Result<{ id: string }>;

/**
 * LINE公式アカウントの有効/無効切り替え
 * 権限: Admin のみ
 */
export async function toggleLineAccountActive(
  id: string
): Promise<ToggleLineAccountActiveResult> {
  const auth = await requireAdmin();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "LINE公式アカウント管理はAdminのみ可能です" },
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("line_official_accounts")
    .select("active")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "アカウントが見つかりません" },
    };
  }

  const { error } = await supabase
    .from("line_official_accounts")
    .update({ active: !current.active })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: "更新に失敗しました" },
    };
  }

  invalidateLineAccountCache();

  await writeAuditLog({
    action: "LINE_ACCOUNT_UPDATE",
    targetType: "line_official_accounts",
    targetId: id,
    success: true,
    metadata: { active: !current.active },
  });

  revalidatePath("/admin/line-accounts");

  return { ok: true, data: { id } };
}

// =====================================================
// 月間メッセージ枠（quota）の表示
// =====================================================

export type LineAccountQuotaItem = {
  /** DB行が無い env 共通アカウントは "env-default" */
  accountKey: string;
  name: string;
  castName: string | null;
  isDefault: boolean;
  /** null = 取得失敗（0件・無制限と区別する） */
  quota: {
    limit: number | null;
    used: number;
    remaining: number | null;
    ratio: number | null;
    projectedMonthEnd: number;
    willExceed: boolean;
    warnLevel: "safe" | "warning" | "critical";
  } | null;
};

export type GetLineAccountQuotasResult = Result<{ items: LineAccountQuotaItem[] }>;

/**
 * 全LINE公式アカウントの今月の送信数・上限・切り替え目安を返す（Admin専用）。
 *
 * 上限・消費数はLINEの公式APIが真実源（プラン変更・手動配信に自動追従）。
 * 5分キャッシュ付きなので画面リロードで外部APIを叩き続けない。
 */
export async function getLineAccountQuotas(): Promise<GetLineAccountQuotasResult> {
  const auth = await requireAdmin();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "LINE公式アカウント管理はAdminのみ可能です" },
    };
  }

  const { fetchLineQuotaSnapshot, assessLineQuota } = await import("@/lib/line-quota");
  const { getDefaultLineAccount, getLineAccountById } = await import("@/lib/line-accounts");
  const adminClient = createAdminSupabaseClient();

  const { data: accounts } = await adminClient
    .from("line_official_accounts")
    .select("id, name, is_default, staff_profiles!line_official_accounts_cast_id_fkey(display_name)")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("name");

  const now = new Date();

  const targets: {
    accountKey: string;
    name: string;
    castName: string | null;
    isDefault: boolean;
    accessToken: string | null;
  }[] = [];

  for (const row of accounts ?? []) {
    const resolved = await getLineAccountById(row.id, adminClient);
    targets.push({
      accountKey: row.id,
      name: row.name,
      castName:
        (row.staff_profiles as unknown as { display_name: string } | null)?.display_name ?? null,
      isDefault: row.is_default,
      accessToken: resolved?.credentials.accessToken ?? null,
    });
  }

  // env フォールバックの共通アカウント（DBに default 行が無い運用）も枠を消費する主体なので表示する
  if (!targets.some((t) => t.isDefault)) {
    try {
      const envDefault = await getDefaultLineAccount(adminClient);
      if (envDefault.id === null) {
        targets.unshift({
          accountKey: "env-default",
          name: envDefault.name,
          castName: null,
          isDefault: true,
          accessToken: envDefault.credentials.accessToken || null,
        });
      }
    } catch {
      // env未設定なら共通アカウント無しとして続行
    }
  }

  const items: LineAccountQuotaItem[] = await Promise.all(
    targets.map(async (t) => {
      if (!t.accessToken) {
        return {
          accountKey: t.accountKey,
          name: t.name,
          castName: t.castName,
          isDefault: t.isDefault,
          quota: null,
        };
      }
      const snapshot = await fetchLineQuotaSnapshot(t.accountKey, {
        accessToken: t.accessToken,
      });
      if (!snapshot) {
        return {
          accountKey: t.accountKey,
          name: t.name,
          castName: t.castName,
          isDefault: t.isDefault,
          quota: null,
        };
      }
      const a = assessLineQuota({ snapshot, now });
      return {
        accountKey: t.accountKey,
        name: t.name,
        castName: t.castName,
        isDefault: t.isDefault,
        quota: {
          limit: a.limit,
          used: a.used,
          remaining: a.remaining,
          ratio: a.ratio,
          projectedMonthEnd: a.projectedMonthEnd,
          willExceed: a.willExceed,
          warnLevel: a.warnLevel,
        },
      };
    })
  );

  return { ok: true, data: { items } };
}

// =====================================================
// LINE側Webhook設定の実測突合（接続の開通確認）
// =====================================================

export type LineWebhookHealthItem = {
  accountId: string;
  name: string;
  expectedUrl: string;
  /**
   * ok         = LINE側の設定がこのアカウントの正しいURL・有効
   * mismatch   = 別のURLが設定されている（別アカウントのURL取り違えが典型）
   * inactive   = URLは正しいがWebhookの利用がオフ
   * unset      = URL未設定
   * unreachable= LINE APIから設定を取得できない（トークン不備等）
   */
  status: "ok" | "mismatch" | "inactive" | "unset" | "unreachable";
  configuredUrl: string | null;
};

export type GetLineWebhookHealthResult = Result<{ items: LineWebhookHealthItem[] }>;

/**
 * 各アカウントのLINE Developers側Webhook設定を実測し、期待URLと突合する（Admin専用）。
 *
 * Webhook URLはLINE側に手動設定する値で、間違っていても**どこにもエラーが出ない**
 * （宛先違いは署名不一致で401破棄され、痕跡すら残らない）。
 * 実例: ゆいのチャネルにれんのURLが設定され、会員のメッセージが数日間すべて
 * 消えていた（2026-08-21 発覚）。コード・DBには現れない設定のため、
 * 実測して画面に常設表示することでしか発見できない。
 */
export async function getLineWebhookHealth(): Promise<GetLineWebhookHealthResult> {
  const auth = await requireAdmin();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "LINE公式アカウント管理はAdminのみ可能です" },
    };
  }

  // 判定本体は lib/line-webhook-audit.ts（日次cronの運営通知と同じ基準を共有）
  const { auditAllLineWebhookEndpoints } = await import("@/lib/line-webhook-audit");
  const adminClient = createAdminSupabaseClient();
  const items = await auditAllLineWebhookEndpoints(adminClient);

  return {
    ok: true,
    data: {
      items: items.map((i) => ({
        accountId: i.accountKey,
        name: i.name,
        expectedUrl: i.expectedUrl,
        status: i.status,
        configuredUrl: i.configuredUrl,
      })),
    },
  };
}

export type RepairLineWebhookResult = Result<{ verified: boolean }>;

/**
 * LINE側のWebhook URLをこのアカウントの正しいURLへ設定し直し、疎通テストまで行う（Admin専用）。
 * mismatch / unset / inactive をワンタップで復旧するための操作。
 */
export async function repairLineWebhookEndpoint(input: {
  accountId: string;
}): Promise<RepairLineWebhookResult> {
  const auth = await requireAdmin();
  if (!auth) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "LINE公式アカウント管理はAdminのみ可能です" },
    };
  }

  const { getLineAccountById } = await import("@/lib/line-accounts");
  const adminClient = createAdminSupabaseClient();
  const resolved = await getLineAccountById(input.accountId, adminClient);
  if (!resolved) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "アカウントが見つからないか、トークンが未設定です" },
    };
  }

  const expectedUrl = buildWebhookUrl(input.accountId);

  try {
    const put = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${resolved.credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: expectedUrl }),
      signal: AbortSignal.timeout(8000),
    });
    if (!put.ok) {
      return {
        ok: false,
        error: { code: "EXTERNAL_API_ERROR", message: `URLの設定に失敗しました（${put.status}）` },
      };
    }

    // LINE→本番エンドポイントの疎通テスト（会員への通知は発生しない）
    let verified = false;
    try {
      const test = await fetch("https://api.line.me/v2/bot/channel/webhook/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolved.credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ endpoint: expectedUrl }),
        signal: AbortSignal.timeout(10000),
      });
      const result = (await test.json()) as { success?: boolean };
      verified = Boolean(result.success);
    } catch {
      verified = false;
    }

    await writeAuditLog({
      action: "LINE_WEBHOOK_REPAIR",
      targetType: "line_official_accounts",
      targetId: input.accountId,
      success: true,
      metadata: { endpoint: expectedUrl, verified },
    });

    revalidatePath("/admin/line-accounts");
    return { ok: true, data: { verified } };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "EXTERNAL_API_ERROR",
        message: err instanceof Error ? err.message : "設定の更新に失敗しました",
      },
    };
  }
}
