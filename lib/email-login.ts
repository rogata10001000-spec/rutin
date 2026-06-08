import crypto from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { normalizeEmail } from "@/lib/email-address";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30分

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function appBaseUrl(): string {
  return getServerEnv().APP_BASE_URL.replace(/\/$/, "");
}

/** 単回ログイントークンを発行し、ハッシュをDBへ保存。生トークンを返す。 */
async function createLoginToken(
  supabase: SupabaseAdmin,
  endUserId: string
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await supabase.from("user_login_tokens").insert({
    end_user_id: endUserId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Failed to create login token: ${error.message}`);
  }

  return rawToken;
}

/**
 * メールログインを要求する。
 * ユーザー列挙を防ぐため、宛先の有無に関わらず常に正常終了する。
 */
export async function requestEmailLogin(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email) return;

  const supabase = createAdminSupabaseClient();
  const { data: endUser } = await supabase
    .from("end_users")
    .select("id, nickname")
    .eq("email", email)
    .maybeSingle();

  // 該当なしでも何もしない（列挙防止）
  if (!endUser) {
    logger.info("requestEmailLogin: no matching end_user", { email });
    return;
  }

  let rawToken: string;
  try {
    rawToken = await createLoginToken(supabase, endUser.id);
  } catch (err) {
    logger.error("requestEmailLogin: token creation failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return;
  }

  // クエリ名は `lt`。middleware は `?token=` を LINE セッションJWTとして消費するため、
  // それと衝突しない別名を使う。
  const loginUrl = `${appBaseUrl()}/account/auth?lt=${encodeURIComponent(rawToken)}`;

  const text = [
    "Rutin の契約・プラン管理ページへのログインリンクです。",
    "",
    "下のリンクから30分以内にログインしてください。",
    loginUrl,
    "",
    "このメールに心当たりがない場合は、破棄してください。",
  ].join("\n");

  const html = `
    <div style="font-family: sans-serif; line-height: 1.7; color: #1c1917;">
      <p>Rutin の契約・プラン管理ページへのログインリンクです。</p>
      <p>下のボタンから<strong>30分以内</strong>にログインしてください。</p>
      <p style="margin: 24px 0;">
        <a href="${loginUrl}"
           style="display: inline-block; background: #e11d74; color: #fff;
                  padding: 12px 24px; border-radius: 9999px; font-weight: bold;
                  text-decoration: none;">
          ログインする
        </a>
      </p>
      <p style="font-size: 12px; color: #78716c;">
        ボタンが押せない場合は、次のURLをブラウザに貼り付けてください。<br />
        <a href="${loginUrl}">${loginUrl}</a>
      </p>
      <p style="font-size: 12px; color: #78716c;">
        このメールに心当たりがない場合は破棄してください。
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "【Rutin】ログインリンク",
    text,
    html,
  });
}

export type ConsumedLogin = {
  endUserId: string;
  lineUserId: string | null;
  email: string | null;
};

/**
 * 生トークンを検証して単回消費する。
 * 期限切れ・使用済み・不正なら null を返す。成功時はメールを本人確認済みにする。
 */
export async function consumeLoginToken(rawToken: string): Promise<ConsumedLogin | null> {
  if (!rawToken) return null;
  const supabase = createAdminSupabaseClient();
  const tokenHash = sha256Hex(rawToken);

  const { data: row } = await supabase
    .from("user_login_tokens")
    .select("id, end_user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  // used_at を原子的にセット（同時利用・再利用を防ぐ）
  const { data: marked } = await supabase
    .from("user_login_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (!marked) return null;

  const { data: endUser } = await supabase
    .from("end_users")
    .select("id, line_user_id, email, email_verified_at")
    .eq("id", row.end_user_id)
    .maybeSingle();

  if (!endUser) return null;

  if (!endUser.email_verified_at) {
    await supabase
      .from("end_users")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("id", endUser.id);
  }

  return {
    endUserId: endUser.id,
    lineUserId: endUser.line_user_id,
    email: endUser.email,
  };
}
