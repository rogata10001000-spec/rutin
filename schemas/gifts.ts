import { z } from "zod";

export const pointCheckoutSchema = z.object({
  endUserId: z.string().uuid(),
  productId: z.string().uuid(),
});

export const sendGiftSchema = z.object({
  endUserId: z.string().uuid(),
  giftId: z.string().uuid(),
});

// 管理用スキーマ

export const upsertGiftCatalogSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "ギフト名が必要です").max(100, "ギフト名は100文字以内で入力してください"),
  category: z.string().min(1, "カテゴリが必要です").max(50, "カテゴリは50文字以内で入力してください"),
  costPoints: z.number().int().positive("必要ポイントは正の整数で入力してください"),
  active: z.boolean(),
  sortOrder: z.number().int().nonnegative().optional(),
  icon: z.string().max(10).nullable().optional(),
});

export const upsertPointProductSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(1, "商品名が必要です").max(100, "商品名は100文字以内で入力してください"),
    points: z.number().int().positive("ポイント数は正の整数で入力してください"),
    priceInclTaxJpy: z.number().int().positive("税込価格は正の整数で入力してください").optional(),
    priceJpy: z.number().int().positive("税込価格は正の整数で入力してください").optional(),
    taxRateId: z.string().uuid().optional(), // 未指定時はデフォルト税率を使用
    stripePriceId: z.string().min(1, "Stripe Price IDが必要です"),
    active: z.boolean(),
  })
  .transform(({ priceJpy, ...rest }) => ({
    ...rest,
    priceInclTaxJpy: rest.priceInclTaxJpy ?? priceJpy ?? 0,
  }))
  .refine((value) => value.priceInclTaxJpy > 0, {
    message: "税込価格は正の整数で入力してください",
    path: ["priceInclTaxJpy"],
  });
