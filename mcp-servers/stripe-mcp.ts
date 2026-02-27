#!/usr/bin/env node

/**
 * Stripe MCP Server
 * Stripe APIへのアクセスを提供するMCPサーバー
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Stripe from "stripe";

// 環境変数からStripe APIキーを取得
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY environment variable is required");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

// MCPサーバーの初期化
const server = new Server(
  {
    name: "stripe-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ==========================================
// Tools（ツール定義）
// ==========================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_subscription",
        description: "Stripeサブスクリプション情報を取得します",
        inputSchema: {
          type: "object",
          properties: {
            subscriptionId: {
              type: "string",
              description: "StripeサブスクリプションID（sub_xxx）",
            },
          },
          required: ["subscriptionId"],
        },
      },
      {
        name: "get_customer",
        description: "Stripe顧客情報を取得します",
        inputSchema: {
          type: "object",
          properties: {
            customerId: {
              type: "string",
              description: "Stripe顧客ID（cus_xxx）",
            },
          },
          required: ["customerId"],
        },
      },
      {
        name: "list_subscriptions",
        description: "サブスクリプション一覧を取得します（フィルタ可能）",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "ステータスでフィルタ（active, canceled, past_due, trialing等）",
              enum: ["active", "canceled", "past_due", "trialing", "paused", "unpaid"],
            },
            customerId: {
              type: "string",
              description: "顧客IDでフィルタ",
            },
            limit: {
              type: "number",
              description: "取得件数（デフォルト: 10, 最大: 100）",
              default: 10,
            },
          },
        },
      },
      {
        name: "list_customers",
        description: "顧客一覧を取得します",
        inputSchema: {
          type: "object",
          properties: {
            email: {
              type: "string",
              description: "メールアドレスで検索",
            },
            limit: {
              type: "number",
              description: "取得件数（デフォルト: 10, 最大: 100）",
              default: 10,
            },
          },
        },
      },
      {
        name: "get_payment_intent",
        description: "支払いインテント情報を取得します",
        inputSchema: {
          type: "object",
          properties: {
            paymentIntentId: {
              type: "string",
              description: "支払いインテントID（pi_xxx）",
            },
          },
          required: ["paymentIntentId"],
        },
      },
      {
        name: "get_checkout_session",
        description: "Checkout Session情報を取得します",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Checkout Session ID（cs_xxx）",
            },
          },
          required: ["sessionId"],
        },
      },
      {
        name: "list_charges",
        description: "チャージ（支払い）一覧を取得します",
        inputSchema: {
          type: "object",
          properties: {
            customerId: {
              type: "string",
              description: "顧客IDでフィルタ",
            },
            limit: {
              type: "number",
              description: "取得件数（デフォルト: 10, 最大: 100）",
              default: 10,
            },
          },
        },
      },
      {
        name: "cancel_subscription",
        description: "サブスクリプションをキャンセルします",
        inputSchema: {
          type: "object",
          properties: {
            subscriptionId: {
              type: "string",
              description: "StripeサブスクリプションID（sub_xxx）",
            },
            cancelImmediately: {
              type: "boolean",
              description: "即座にキャンセルするか（falseの場合は期間終了時にキャンセル）",
              default: false,
            },
          },
          required: ["subscriptionId"],
        },
      },
      {
        name: "update_subscription",
        description: "サブスクリプションを更新します（プラン変更等）",
        inputSchema: {
          type: "object",
          properties: {
            subscriptionId: {
              type: "string",
              description: "StripeサブスクリプションID（sub_xxx）",
            },
            priceId: {
              type: "string",
              description: "新しい価格ID（price_xxx）",
            },
            prorationBehavior: {
              type: "string",
              description: "比例配分の動作",
              enum: ["create_prorations", "none", "always_invoice"],
              default: "create_prorations",
            },
          },
          required: ["subscriptionId", "priceId"],
        },
      },
    ],
  };
});

// ==========================================
// Tool Handlers（ツール実行）
// ==========================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_subscription": {
        const subscription = await stripe.subscriptions.retrieve(
          args.subscriptionId as string,
          { expand: ["customer", "items.data.price.product"] }
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(subscription, null, 2),
            },
          ],
        };
      }

      case "get_customer": {
        const customer = await stripe.customers.retrieve(args.customerId as string, {
          expand: ["subscriptions"],
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(customer, null, 2),
            },
          ],
        };
      }

      case "list_subscriptions": {
        const params: Stripe.SubscriptionListParams = {
          limit: (args.limit as number) || 10,
          expand: ["data.customer", "data.items.data.price"],
        };
        if (args.status) {
          params.status = args.status as Stripe.Subscription.Status;
        }
        if (args.customerId) {
          params.customer = args.customerId as string;
        }
        const subscriptions = await stripe.subscriptions.list(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  data: subscriptions.data,
                  hasMore: subscriptions.has_more,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "list_customers": {
        const params: Stripe.CustomerListParams = {
          limit: (args.limit as number) || 10,
        };
        if (args.email) {
          params.email = args.email as string;
        }
        const customers = await stripe.customers.list(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  data: customers.data,
                  hasMore: customers.has_more,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_payment_intent": {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          args.paymentIntentId as string
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(paymentIntent, null, 2),
            },
          ],
        };
      }

      case "get_checkout_session": {
        const session = await stripe.checkout.sessions.retrieve(
          args.sessionId as string,
          { expand: ["customer", "subscription", "payment_intent"] }
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(session, null, 2),
            },
          ],
        };
      }

      case "list_charges": {
        const params: Stripe.ChargeListParams = {
          limit: (args.limit as number) || 10,
        };
        if (args.customerId) {
          params.customer = args.customerId as string;
        }
        const charges = await stripe.charges.list(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  data: charges.data,
                  hasMore: charges.has_more,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "cancel_subscription": {
        const cancelImmediately = args.cancelImmediately as boolean | undefined;
        let subscription;
        if (cancelImmediately) {
          subscription = await stripe.subscriptions.cancel(
            args.subscriptionId as string
          );
        } else {
          subscription = await stripe.subscriptions.update(
            args.subscriptionId as string,
            { cancel_at_period_end: true }
          );
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  subscription: subscription,
                  message: cancelImmediately
                    ? "サブスクリプションを即座にキャンセルしました"
                    : "サブスクリプションを期間終了時にキャンセルするように設定しました",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "update_subscription": {
        const subscription = await stripe.subscriptions.update(
          args.subscriptionId as string,
          {
            items: [
              {
                id: (await stripe.subscriptions.retrieve(args.subscriptionId as string))
                  .items.data[0].id,
                price: args.priceId as string,
              },
            ],
            proration_behavior:
              (args.prorationBehavior as Stripe.SubscriptionUpdateParams.ProrationBehavior) ||
              "create_prorations",
          }
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  subscription: subscription,
                  message: "サブスクリプションを更新しました",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorType =
      typeof error === "object" && error !== null && "type" in error
        ? String((error as { type?: unknown }).type ?? "UnknownError")
        : "UnknownError";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: true,
              message: errorMessage,
              type: errorType,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// ==========================================
// Resources（リソース定義）
// ==========================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "stripe://subscriptions",
        name: "Stripe Subscriptions",
        description: "Stripeサブスクリプション一覧",
        mimeType: "application/json",
      },
      {
        uri: "stripe://customers",
        name: "Stripe Customers",
        description: "Stripe顧客一覧",
        mimeType: "application/json",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    switch (uri) {
      case "stripe://subscriptions": {
        const subscriptions = await stripe.subscriptions.list(
          { limit: 50, expand: ["data.customer"] }
        );
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(subscriptions.data, null, 2),
            },
          ],
        };
      }

      case "stripe://customers": {
        const customers = await stripe.customers.list({ limit: 50 });
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(customers.data, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: `Error: ${errorMessage}`,
        },
      ],
    };
  }
});

// ==========================================
// サーバー起動
// ==========================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Stripe MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
