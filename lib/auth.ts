import { createServerSupabaseClient } from "./supabase/server";
import type { StaffRole } from "./supabase/types";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env";
import { USER_SESSION_COOKIE } from "@/lib/constants";

/**
 * 現在ログイン中のスタッフ情報を取得
 */
export async function getCurrentStaff() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("*")
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
}

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

  // Shadowチェック
  const { data: shadow } = await supabase
    .from("cast_assignments")
    .select("id")
    .eq("end_user_id", endUserId)
    .eq("to_cast_id", staff.id)
    .gt("shadow_until", new Date().toISOString())
    .limit(1)
    .single();

  if (shadow) {
    return { id: staff.id, role: staff.role, isAssigned: false, isShadow: true };
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
  line_user_id: string;
  exp: number;
}

/**
 * ユーザー向けトークン生成
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
 * ユーザー向けトークン検証
 */
export function verifyUserToken(token: string): {
  ok: true;
  lineUserId: string;
  error?: undefined;
} | {
  ok: false;
  lineUserId?: undefined;
  error: "invalid" | "expired";
} {
  if (!USER_TOKEN_SECRET) {
    return { ok: false, error: "invalid" };
  }

  try {
    const decoded = jwt.verify(token, USER_TOKEN_SECRET) as UserTokenPayload;
    return { ok: true, lineUserId: decoded.line_user_id };
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
export function getUserFromRequest(request: Request): {
  ok: true;
  lineUserId: string;
} | {
  ok: false;
  error: "missing" | "invalid" | "expired";
} {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return { ok: false, error: "missing" };
  }

  return verifyUserToken(token);
}

export async function getUserFromServerCookies(): Promise<
  | { ok: true; lineUserId: string }
  | { ok: false; error: "missing" | "invalid" | "expired" }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (!token) {
    return { ok: false, error: "missing" };
  }
  return verifyUserToken(token);
}
