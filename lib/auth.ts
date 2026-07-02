import { cache } from "react";
import { createServerSupabaseClient } from "./supabase/server";
import type { StaffRole } from "./supabase/types";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env";
import { USER_SESSION_COOKIE } from "@/lib/constants";

/**
 * 現在ログイン中のスタッフ情報を取得。
 * React cache() で「同一リクエスト内」はデデュープする:
 * 1ページ描画で複数の Server Action/RSC がそれぞれ認証すると、
 * auth.getUser()（Authサーバーへの往復）＋staff_profiles 照会が何度も走るため。
 */
export const getCurrentStaff = cache(async () => {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("id, role, display_name, active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) {
    return null;
  }

  return {
    id: profile.id,
    role: profile.role as StaffRole,
    displayName: profile.display_name,
    email: user.email,
  };
});

/**
 * 現在のスタッフのロールを取得
 */
export async function getCurrentStaffRole(): Promise<StaffRole | null> {
  const staff = await getCurrentStaff();
  return staff?.role ?? null;
}

/**
 * Admin権限チェック
 */
export async function requireAdmin(): Promise<{ id: string; role: "admin" } | null> {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== "admin") {
    return null;
  }
  return { id: staff.id, role: "admin" };
}

/**
 * Admin/Supervisor権限チェック
 */
export async function requireAdminOrSupervisor(): Promise<{
  id: string;
  role: "admin" | "supervisor";
} | null> {
  const staff = await getCurrentStaff();
  if (!staff || (staff.role !== "admin" && staff.role !== "supervisor")) {
    return null;
  }
  return { id: staff.id, role: staff.role };
}

/**
 * 担当ユーザーへのアクセス権限チェック
 */
export async function canAccessUser(endUserId: string): Promise<{
  id: string;
  role: StaffRole;
  isAssigned: boolean;
  isShadow: boolean;
} | null> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return null;
  }

  // Admin/Supervisorは全ユーザーアクセス可
  if (staff.role === "admin" || staff.role === "supervisor") {
    return { id: staff.id, role: staff.role, isAssigned: true, isShadow: false };
  }

  // Castは担当ユーザーのみ
  const supabase = await createServerSupabaseClient();

  // 担当チェック
  const { data: user } = await supabase
    .from("end_users")
    .select("assigned_cast_id")
    .eq("id", endUserId)
    .single();

  if (user?.assigned_cast_id === staff.id) {
    return { id: staff.id, role: staff.role, isAssigned: true, isShadow: false };
  }

  return null;
}

/**
 * 送信権限チェック（Shadowは送信不可）
 */
export async function canSendMessage(endUserId: string): Promise<{
  id: string;
  role: StaffRole;
} | null> {
  const access = await canAccessUser(endUserId);

  // アクセス権なし、またはShadowは送信不可
  if (!access || access.isShadow) {
    return null;
  }

  return { id: access.id, role: access.role };
}

// =====================================================
// ユーザー向けWebページ用JWT認証
// =====================================================

const USER_TOKEN_SECRET = getServerEnv().LINE_USER_TOKEN_SECRET;
const USER_TOKEN_EXPIRY = 60 * 30; // 30分

interface UserTokenPayload {
  /** LINE経由の本人。メール単独ログイン（将来）では存在しない場合がある。 */
  line_user_id?: string;
  /** end_users.id。本人アンカー。新しいセッションでは必ず含める。 */
  end_user_id?: string;
  exp: number;
}

export type VerifiedUser = {
  ok: true;
  lineUserId: string | null;
  endUserId: string | null;
  error?: undefined;
};

export type VerifyUserFailure = {
  ok: false;
  lineUserId?: undefined;
  endUserId?: undefined;
  error: "invalid" | "expired";
};

/**
 * LINE導線用トークン生成（line_user_id ベース・後方互換）。
 */
export function generateUserToken(lineUserId: string): string {
  if (!USER_TOKEN_SECRET) {
    throw new Error("LINE_USER_TOKEN_SECRET is not configured");
  }

  return jwt.sign(
    {
      line_user_id: lineUserId,
      exp: Math.floor(Date.now() / 1000) + USER_TOKEN_EXPIRY,
    },
    USER_TOKEN_SECRET
  );
}

/**
 * セッショントークン生成（本人ID中心）。
 * end_user_id を必須アンカーとし、判明していれば line_user_id も載せる。
 * メールログイン・LINE双方で共通利用する。
 */
export function generateUserSessionToken(params: {
  endUserId: string;
  lineUserId?: string | null;
  expiresInSeconds?: number;
}): string {
  if (!USER_TOKEN_SECRET) {
    throw new Error("LINE_USER_TOKEN_SECRET is not configured");
  }

  const payload: Record<string, unknown> = {
    end_user_id: params.endUserId,
    exp: Math.floor(Date.now() / 1000) + (params.expiresInSeconds ?? USER_TOKEN_EXPIRY),
  };
  if (params.lineUserId) {
    payload.line_user_id = params.lineUserId;
  }

  return jwt.sign(payload, USER_TOKEN_SECRET);
}

/**
 * ユーザー向けトークン検証
 */
export function verifyUserToken(token: string): VerifiedUser | VerifyUserFailure {
  if (!USER_TOKEN_SECRET) {
    return { ok: false, error: "invalid" };
  }

  try {
    const decoded = jwt.verify(token, USER_TOKEN_SECRET) as UserTokenPayload;
    return {
      ok: true,
      lineUserId: decoded.line_user_id ?? null,
      endUserId: decoded.end_user_id ?? null,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { ok: false, error: "expired" };
    }
    return { ok: false, error: "invalid" };
  }
}

/**
 * リクエストからユーザートークンを取得・検証
 */
export function getUserFromRequest(request: Request):
  | VerifiedUser
  | { ok: false; error: "missing" | "invalid" | "expired" } {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return { ok: false, error: "missing" };
  }

  return verifyUserToken(token);
}

export async function getUserFromServerCookies(): Promise<
  VerifiedUser | { ok: false; error: "missing" | "invalid" | "expired" }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (!token) {
    return { ok: false, error: "missing" };
  }
  return verifyUserToken(token);
}
