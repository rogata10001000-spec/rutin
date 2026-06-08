/**
 * Validates required environment variables for production soft launch.
 * Usage: npx tsx scripts/verify-production-env.ts
 */
import { z } from "zod";

const productionEnvSchema = z.object({
  NODE_ENV: z.literal("production").optional(),
  APP_BASE_URL: z.string().url().refine((url) => !url.includes("localhost"), {
    message: "APP_BASE_URL must not be localhost in production",
  }),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  LINE_USER_TOKEN_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z
    .string()
    .min(1)
    .refine((key) => key.startsWith("sk_live_"), {
      message: "STRIPE_SECRET_KEY should use sk_live_ for production",
    }),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_LIGHT: z.string().min(1),
  STRIPE_PRICE_STANDARD: z.string().min(1),
  STRIPE_PRICE_PREMIUM: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  RICH_MENU_ID_UNCONTRACTED: z.string().min(1),
  RICH_MENU_ID_CONTRACTED: z.string().min(1),
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
});

const result = productionEnvSchema.safeParse(process.env);

if (!result.success) {
  console.error("Production environment validation failed:\n");
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const env = result.data;
if (
  (env.WEB_PUSH_VAPID_PUBLIC_KEY && !env.WEB_PUSH_VAPID_PRIVATE_KEY) ||
  (!env.WEB_PUSH_VAPID_PUBLIC_KEY && env.WEB_PUSH_VAPID_PRIVATE_KEY)
) {
  console.error("WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY must both be set or both omitted.");
  process.exit(1);
}

if (env.RESEND_API_KEY && !env.EMAIL_FROM) {
  console.error("EMAIL_FROM must be set when RESEND_API_KEY is configured.");
  process.exit(1);
}

console.log("Production environment validation passed.");
if (!env.WEB_PUSH_VAPID_PUBLIC_KEY) {
  console.warn("Warning: Web Push VAPID keys are not set. Staff push notifications will be skipped.");
}
if (!env.RESEND_API_KEY) {
  console.warn(
    "Warning: RESEND_API_KEY is not set. Email login and email notifications (LINE-independent fallback) will be skipped."
  );
}
