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
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  AI_PROVIDER_KEY: z.string().min(1).optional(),
  AI_DRAFT_DAILY_LIMIT: z.coerce.number().int().positive().default(3),
  RICH_MENU_ID_UNCONTRACTED: z.string().optional(),
  RICH_MENU_ID_CONTRACTED: z.string().optional(),
  TRIAL_PLAN_CODE: z.string().default("standard"),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
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
  const parsed = clientEnvSchema.safeParse(process.env);
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
