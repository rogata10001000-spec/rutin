"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
  const base = getServerEnv().APP_BASE_URL.replace(/\/$/, "");
  return `${base}/api/webhooks/line/${id}`;
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
