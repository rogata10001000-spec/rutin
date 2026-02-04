import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で入力してください");

export const settlementPeriodSchema = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((v) => v.from <= v.to, { message: "期間の開始と終了を確認してください" });
