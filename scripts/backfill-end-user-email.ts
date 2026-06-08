#!/usr/bin/env tsx

/**
 * 既存契約者のメールアドレスを Stripe Customer から end_users へバックフィルする。
 *
 * 目的: LINE 非依存の連絡・ログイン経路を全契約者に確保する。
 *
 * 使い方:
 *   npm run backfill:email -- --dry-run   # 変更せず対象を表示
 *   npm run backfill:email                # 実際に書き込む
 *
 * 既に email が入っている end_user はスキップする（上書きしない）。
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRY_RUN = process.argv.includes("--dry-run");

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

async function main() {
  if (!STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY が設定されていません");
    process.exit(1);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Supabase の URL / SERVICE_ROLE_KEY が設定されていません");
    process.exit(1);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`${DRY_RUN ? "[dry-run] " : ""}メールバックフィルを開始します...\n`);

  // email 未登録の end_user と、その Stripe customer を subscriptions 経由で取得
  const { data: rows, error } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, end_user_id, end_users!inner(id, email, line_user_id)");

  if (error) {
    console.error("subscriptions の取得に失敗:", error.message);
    process.exit(1);
  }

  // end_user 単位で重複排除（最新の customer を採用）
  const targets = new Map<string, { customerId: string; lineUserId: string }>();
  for (const row of rows ?? []) {
    const eu = (row as unknown as {
      end_users: { id: string; email: string | null; line_user_id: string };
      stripe_customer_id: string;
    }).end_users;
    if (!eu || eu.email) continue; // 既にメールあり → スキップ
    targets.set(eu.id, {
      customerId: (row as unknown as { stripe_customer_id: string }).stripe_customer_id,
      lineUserId: eu.line_user_id,
    });
  }

  console.log(`メール未登録の契約者: ${targets.size} 件\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [endUserId, { customerId, lineUserId }] of targets) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      const email =
        customer && !("deleted" in customer && customer.deleted)
          ? normalizeEmail((customer as Stripe.Customer).email)
          : null;

      if (!email) {
        console.log(`- skip  end_user=${endUserId} (Stripeにメールなし) line=${lineUserId}`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`- would update end_user=${endUserId} -> ${email}`);
        updated++;
        continue;
      }

      const { error: updErr } = await supabase
        .from("end_users")
        .update({ email })
        .eq("id", endUserId)
        .is("email", null); // 競合時の上書き防止

      if (updErr) {
        // unique 制約違反（別ユーザーが同メール）等
        console.log(`- fail  end_user=${endUserId} (${updErr.message})`);
        failed++;
        continue;
      }

      console.log(`- update end_user=${endUserId} -> ${email}`);
      updated++;
    } catch (e) {
      console.log(`- fail  end_user=${endUserId} (${(e as Error).message})`);
      failed++;
    }
  }

  console.log(`\n完了: 更新 ${updated} / スキップ ${skipped} / 失敗 ${failed}`);
}

main();
