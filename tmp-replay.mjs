// 修正コードのデプロイ後に、過去の paid invoice を正規Webhook経路で再処理する。
// Stripeイベントは30日で失効するため、invoice本体（永続）から payload を再構成し、
// STRIPE_WEBHOOK_SECRET で署名して本番エンドポイントへ POST する。
// event_id は "evt_recovery_<invoiceId>" の合成キー＝webhook_events の冪等化がそのまま効く。
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const ENDPOINT = `${process.env.APP_BASE_URL}/api/webhooks/stripe`;

// 3本のサブスクの paid invoice を全列挙
const subs = ["sub_1TgD5nEUDRKejAq67KxKS5fM","sub_1TjxHOEUDRKejAq6YQ33KLuk","sub_1U6NAAEUDRKejAq65kdiBdDy"];
const invoices = [];
for (const s of subs) {
  const r = await fetch(`https://api.stripe.com/v1/invoices?subscription=${s}&limit=100`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  const j = await r.json();
  for (const inv of j.data ?? []) {
    if (inv.status === "paid" && (inv.amount_paid ?? 0) > 0) invoices.push(inv);
  }
}
console.log("再処理対象の paid invoice:", invoices.map(i => `${i.id} ¥${i.amount_paid} ${new Date(i.created*1000).toISOString().slice(0,10)}`));

for (const inv of invoices) {
  const event = {
    id: `evt_recovery_${inv.id}`,
    object: "event",
    api_version: "2026-01-28.clover",
    created: inv.status_transitions?.paid_at ?? inv.created,
    type: "invoice.paid",
    data: { object: inv },
    livemode: inv.livemode,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  };
  const payload = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", SECRET.replace(/^whsec_/, "")).update(`${ts}.${payload}`).digest("hex");
  // Stripe SDK の constructEvent は whsec_ プレフィックス込みのキーで検証する実装もあるため両方試す
  const sigFull = crypto.createHmac("sha256", SECRET).update(`${ts}.${payload}`).digest("hex");

  let ok = false;
  for (const v1 of [sigFull, sig]) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${ts},v1=${v1}` },
      body: payload,
    });
    const text = await res.text();
    if (res.status === 200) { console.log(inv.id, "→ 200 OK", text.slice(0,80)); ok = true; break; }
    if (res.status !== 400) { console.log(inv.id, "→", res.status, text.slice(0,120)); break; }
  }
  if (!ok) console.log(inv.id, "→ 署名不一致または処理失敗");
}

const { data: revs } = await sb.from("revenue_events").select("*");
console.log("\nrevenue_events:", revs?.length, "件");
for (const r of revs ?? []) console.log(JSON.stringify(r).slice(0, 240));
