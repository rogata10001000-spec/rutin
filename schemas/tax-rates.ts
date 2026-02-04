import { z } from "zod";

/**
 * 税率作成/更新スキーマ
 */
export const upsertTaxRateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "名称を入力してください").max(50, "名称は50文字以内で入力してください"),
  rate: z.number().min(0, "税率は0以上で入力してください").max(1, "税率は1以下で入力してください"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "有効開始日を入力してください"),
  active: z.boolean(),
});

export type UpsertTaxRateInput = z.infer<typeof upsertTaxRateSchema>;
