import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { getServerEnv } from "@/lib/env";

/**
 * Server Component / Server Action用のSupabaseクライアント
 * RLSが適用される（認証ユーザーの権限で実行）
 */
export async function createServerSupabaseClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Componentでは書き込み不可
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Server Componentでは書き込み不可
          }
        },
      },
    }
  );
}

/**
 * Admin用のSupabaseクライアント（service_role）
 * RLSをバイパスする - webhook処理等のシステム処理用
 * 絶対にクライアントに露出させないこと
 */
export function createAdminSupabaseClient() {
  const env = getServerEnv();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        get: () => undefined,
        set: () => {},
        remove: () => {},
      },
    }
  );
}
