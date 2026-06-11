import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import type { LineAccountCredentials } from "@/lib/line";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

/**
 * 解決済みLINE公式アカウント。
 * id が null の場合は env からのデフォルト(共通)フォールバック。
 */
export type ResolvedLineAccount = {
  id: string | null;
  castId: string | null;
  isDefault: boolean;
  name: string;
  credentials: LineAccountCredentials;
  botUserId: string | null;
  richMenuUncontractedId: string | null;
  richMenuContractedId: string | null;
  friendAddUrl: string | null;
};

type LineAccountRow = {
  id: string;
  cast_id: string | null;
  is_default: boolean;
  name: string;
  bot_user_id: string | null;
  channel_secret_encrypted: string | null;
  channel_access_token_encrypted: string | null;
  rich_menu_uncontracted_id: string | null;
  rich_menu_contracted_id: string | null;
  friend_add_url: string | null;
  active: boolean;
};

const SELECT_COLUMNS =
  "id, cast_id, is_default, name, bot_user_id, channel_secret_encrypted, channel_access_token_encrypted, rich_menu_uncontracted_id, rich_menu_contracted_id, friend_add_url, active";

const CACHE_TTL_MS = 60 * 1000;

type CacheEntry = { account: ResolvedLineAccount | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): ResolvedLineAccount | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.account;
}

function cacheSet(key: string, account: ResolvedLineAccount | null): void {
  cache.set(key, { account, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** アカウント設定変更時にキャッシュを全消去する（管理画面の保存後に呼ぶ）。 */
export function invalidateLineAccountCache(): void {
  cache.clear();
}

/** env からのデフォルト(共通)アカウント。DBに is_default 行が無い場合のフォールバック。 */
function buildEnvDefaultAccount(): ResolvedLineAccount {
  const env = getServerEnv();
  return {
    id: null,
    castId: null,
    isDefault: true,
    name: "Routine（共通）",
    credentials: {
      accessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: env.LINE_CHANNEL_SECRET,
    },
    botUserId: null,
    richMenuUncontractedId: env.RICH_MENU_ID_UNCONTRACTED ?? null,
    richMenuContractedId: env.RICH_MENU_ID_CONTRACTED ?? null,
    friendAddUrl: null,
  };
}

function mapRow(row: LineAccountRow): ResolvedLineAccount | null {
  if (!row.channel_access_token_encrypted || !row.channel_secret_encrypted) {
    logger.warn("LINE account missing credentials", { accountId: row.id });
    return null;
  }

  try {
    return {
      id: row.id,
      castId: row.cast_id,
      isDefault: row.is_default,
      name: row.name,
      credentials: {
        accessToken: decryptSecret(row.channel_access_token_encrypted),
        channelSecret: decryptSecret(row.channel_secret_encrypted),
      },
      botUserId: row.bot_user_id,
      richMenuUncontractedId: row.rich_menu_uncontracted_id,
      richMenuContractedId: row.rich_menu_contracted_id,
      friendAddUrl: row.friend_add_url,
    };
  } catch (err) {
    logger.error("LINE account credential decryption failed", {
      accountId: row.id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

/** デフォルト(共通)アカウントを解決する。DBの is_default 行 → 無ければ env フォールバック。 */
export async function getDefaultLineAccount(
  supabase?: SupabaseAdmin
): Promise<ResolvedLineAccount> {
  const cached = cacheGet("default");
  if (cached !== undefined && cached !== null) return cached;

  const client = supabase ?? createAdminSupabaseClient();
  const { data } = await client
    .from("line_official_accounts")
    .select(SELECT_COLUMNS)
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();

  const resolved = data ? mapRow(data as LineAccountRow) : null;
  const account = resolved ?? buildEnvDefaultAccount();
  cacheSet("default", account);
  return account;
}

/** id でアカウントを解決する。null=未設定/無効。 */
export async function getLineAccountById(
  id: string,
  supabase?: SupabaseAdmin
): Promise<ResolvedLineAccount | null> {
  const cached = cacheGet(`id:${id}`);
  if (cached !== undefined) return cached;

  const client = supabase ?? createAdminSupabaseClient();
  const { data } = await client
    .from("line_official_accounts")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();

  const account = data ? mapRow(data as LineAccountRow) : null;
  cacheSet(`id:${id}`, account);
  return account;
}

/** bot_user_id（webhook destination）でアカウントを解決する。 */
export async function getLineAccountByBotUserId(
  botUserId: string,
  supabase?: SupabaseAdmin
): Promise<ResolvedLineAccount | null> {
  const client = supabase ?? createAdminSupabaseClient();
  const { data } = await client
    .from("line_official_accounts")
    .select(SELECT_COLUMNS)
    .eq("bot_user_id", botUserId)
    .eq("active", true)
    .maybeSingle();

  return data ? mapRow(data as LineAccountRow) : null;
}

/** メイト(cast)の active アカウントを解決する。未設定なら null。 */
export async function getLineAccountForCast(
  castId: string,
  supabase?: SupabaseAdmin
): Promise<ResolvedLineAccount | null> {
  const cached = cacheGet(`cast:${castId}`);
  if (cached !== undefined) return cached;

  const client = supabase ?? createAdminSupabaseClient();
  const { data } = await client
    .from("line_official_accounts")
    .select(SELECT_COLUMNS)
    .eq("cast_id", castId)
    .eq("active", true)
    .maybeSingle();

  const account = data ? mapRow(data as LineAccountRow) : null;
  cacheSet(`cast:${castId}`, account);
  return account;
}

/**
 * end_user への送信に使うアカウントを解決する。
 * ユーザーが現在会話しているアカウント（primary_line_account_id）を優先し、
 * 未設定・無効ならデフォルト(共通)に戻す。
 *
 * 担当メイトのアカウントが存在しても、ユーザーがまだその公式LINEを友だち追加
 * していない段階でpushするとLINE側で失敗するため、assigned_cast_idだけでは選ばない。
 */
export async function getSendAccountForEndUser(
  endUserId: string,
  supabase?: SupabaseAdmin
): Promise<ResolvedLineAccount> {
  const client = supabase ?? createAdminSupabaseClient();

  const { data: user } = await client
    .from("end_users")
    .select("primary_line_account_id")
    .eq("id", endUserId)
    .maybeSingle();

  if (user?.primary_line_account_id) {
    const currentAccount = await getLineAccountById(user.primary_line_account_id, client);
    if (currentAccount) return currentAccount;
  }

  return getDefaultLineAccount(client);
}
