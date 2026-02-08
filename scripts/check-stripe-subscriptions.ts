#!/usr/bin/env tsx

/**
 * Stripeサブスクリプション一覧を取得するスクリプト
 */

import Stripe from "stripe";
import * as dotenv from "dotenv";
import { resolve } from "path";

// .env.localを読み込む
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEYが設定されていません");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

async function main() {
  try {
    console.log("🔍 Stripeサブスクリプション一覧を取得中...\n");

    const subscriptions = await stripe.subscriptions.list(
      {
        limit: 100,
        expand: ["data.customer", "data.items.data.price"],
      }
    );

    if (subscriptions.data.length === 0) {
      console.log("📭 サブスクリプションが見つかりませんでした。\n");
      console.log("💡 テスト用のサブスクリプションを作成するには、StripeダッシュボードまたはAPIを使用してください。");
      return;
    }

    console.log(`✅ ${subscriptions.data.length}件のサブスクリプションが見つかりました:\n`);

    subscriptions.data.forEach((sub, index) => {
      const customer = typeof sub.customer === "string" ? sub.customer : sub.customer;
      const customerId = typeof customer === "object" ? customer.id : customer;
      const customerEmail = typeof customer === "object" && "email" in customer ? customer.email : "N/A";

      console.log(`${index + 1}. サブスクリプションID: ${sub.id}`);
      console.log(`   ステータス: ${sub.status}`);
      console.log(`   顧客ID: ${customerId}`);
      console.log(`   顧客メール: ${customerEmail}`);
      console.log(`   現在の期間終了: ${new Date(sub.current_period_end * 1000).toLocaleString("ja-JP")}`);
      console.log(`   作成日時: ${new Date(sub.created * 1000).toLocaleString("ja-JP")}`);
      
      if (sub.items.data.length > 0) {
        const item = sub.items.data[0];
        const price = item.price;
        const product = typeof price.product === "string" ? null : price.product;
        console.log(`   プラン: ${product ? (product as any).name || "N/A" : "N/A"}`);
        console.log(`   価格ID: ${price.id}`);
        console.log(`   金額: ¥${(price.unit_amount || 0) / 100} ${price.currency.toUpperCase()}`);
      }
      
      if (sub.metadata && Object.keys(sub.metadata).length > 0) {
        console.log(`   メタデータ:`, sub.metadata);
      }
      
      console.log("");
    });

    // ステータス別の集計
    const statusCounts = subscriptions.data.reduce((acc, sub) => {
      acc[sub.status] = (acc[sub.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log("📊 ステータス別集計:");
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}件`);
    });

  } catch (error: any) {
    console.error("❌ エラーが発生しました:", error.message);
    if (error.type) {
      console.error(`   エラータイプ: ${error.type}`);
    }
    process.exit(1);
  }
}

main();
