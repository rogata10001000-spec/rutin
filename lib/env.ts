import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  LINE_USER_TOKEN_SECRET: z.string().min(32),
  // メイト別LINE公式アカウントのtoken/secret暗号化鍵（base64 32byte）。DBアカウント作成時に必須。
  LINE_TOKEN_ENC_KEY: z.string().optional(),
  // LIFF: IDトークン検証用のチャネルID（client_id）。未設定ならLIFF導線は無効。
  LINE_LIFF_CHANNEL_ID: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_LIGHT: z.string().optional(),
  STRIPE_PRICE_STANDARD: z.string().optional(),
  STRIPE_PRICE_PREMIUM: z.string().optional(),
  // 年額プラン（任意）。未設定なら年額導線は自動的に非表示。
  STRIPE_PRICE_LIGHT_ANNUAL: z.string().optional(),
  STRIPE_PRICE_STANDARD_ANNUAL: z.string().optional(),
  STRIPE_PRICE_PREMIUM_ANNUAL: z.string().optional(),
  AI_PROVIDER_KEY: z.string().min(1).optional(),
  /** AI下書きに使うモデル。既定は最新のHaiku（速度・コスト優先） */
  AI_MODEL: z.string().min(1).default("claude-haiku-4-5-20251001"),
  /** スタッフ1人あたりの1日の生成上限（manual+bulk。事前生成は対象外） */
  AI_STAFF_DAILY_LIMIT: z.coerce.number().int().positive().default(300),
  /** 1ユーザーあたりの事前生成の1日上限（受信のたびの生成が暴走しないための天井） */
  AI_PREGEN_DAILY_LIMIT: z.coerce.number().int().positive().default(20),
  /**
   * 事前生成の1日あたり総件数の上限（全ユーザー合計）。
   * ユーザー別上限だけでは「利用者が増えた分だけ青天井」になるため、
   * 事業全体のコスト天井をここで持つ。超過後は事前生成を止めるだけで、
   * メイトが手動で押せば通常どおり生成される（機能は壊れない）。
   */
  AI_PREGEN_GLOBAL_DAILY_LIMIT: z.coerce.number().int().positive().default(600),
  // 1ユーザーあたりの1日の生成上限（manual+bulk。事前生成は対象外）。
  // 3だと再生成ボタン3回で枯渇して体験が悪いため既定を10へ引き上げ
  // （本番のVercel envで3が明示設定されている場合はそちらが優先される点に注意）。
  AI_DRAFT_DAILY_LIMIT: z.coerce.number().int().positive().default(10),
  /** スタイル要約など、精度が要る非対話処理のモデル（未設定なら AI_MODEL と同じ） */
  AI_MODEL_ANALYSIS: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  // 分散レート制限（Upstash Redis REST）。未設定ならインスタンス内メモリにフォールバック。
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  RICH_MENU_ID_UNCONTRACTED: z.string().optional(),
  RICH_MENU_ID_CONTRACTED: z.string().optional(),
  TRIAL_PERIOD_DAYS: z.coerce.number().int().positive().default(7),
  TRIAL_PLAN_CODE: z.string().default("standard"),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_CONTACT: z.string().optional(),
  // メール送信（Resend）。LINE非依存の連絡・ログイン経路に使用。
  RESEND_API_KEY: z.string().optional(),
  NOTIFICATION_FROM_EMAIL: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
  // LIFF アプリ ID（フロントの liff.init 用、公開値）
  NEXT_PUBLIC_LIFF_ID: z.string().optional(),
});

let cachedServerEnv: z.infer<typeof serverEnvSchema> | null = null;
let cachedClientEnv: z.infer<typeof clientEnvSchema> | null = null;

export const getServerEnv = () => {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`
    );
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
};

export const getClientEnv = () => {
  if (cachedClientEnv) return cachedClientEnv;
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    WEB_PUSH_VAPID_PUBLIC_KEY: process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_LIFF_ID: process.env.NEXT_PUBLIC_LIFF_ID,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid client environment variables: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`
    );
  }
  cachedClientEnv = parsed.data;
  return cachedClientEnv;
};
