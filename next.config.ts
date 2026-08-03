import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// CSP のうち「スクリプト以外」の高価値ディレクティブだけを適用する。
// script-src の厳格化は nonce 配布と全画面のブラウザ検証が必要なため、ここでは入れない
// （未検証の script-src は本番を壊すリスクの方が大きい）。以下は挙動を壊さずに
// 実害の大きい攻撃面（クリックジャッキング・base乗っ取り・フォーム送信先の書き換え・
// プラグイン埋め込み）を塞ぐ。
const contentSecurityPolicy = [
  "frame-ancestors 'none'", // クリックジャッキング防止（X-Frame-Options の後継）
  "base-uri 'self'", // <base> 注入で相対URLの解決先を奪われるのを防ぐ
  "object-src 'none'", // <object>/<embed> による古いプラグイン経由の実行を禁止
  "form-action 'self'", // フォームの送信先を自サイトに限定（Server Actions は同一オリジン）
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // HTTPS を強制（LINE内ブラウザ経由の中間者攻撃対策）。localhost では無視される。
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // 使っていない強い権限を明示的に無効化する
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // 別オリジンの window から参照されないようにする
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Next.js 16 では serverActions は experimental 配下（FormData+5MB と揃えないと大きい画像で Server Action が落ちる）
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
});
