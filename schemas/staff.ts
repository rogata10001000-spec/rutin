import { z } from "zod";

export const staffGenderSchema = z.enum(["female", "male", "other"]);

export const upsertStaffProfileSchema = z.object({
  staffId: z.string().uuid(),
  displayName: z.string().min(1, "表示名を入力してください"),
  role: z.enum(["admin", "supervisor", "cast"]),
  capacityLimit: z.number().int().positive().nullable().optional(),
  active: z.boolean(),
  acceptingNewUsers: z.boolean().optional(),
  gender: staffGenderSchema.nullable().optional(),
});

export const setCastAcceptingSchema = z.object({
  castId: z.string().uuid(),
  acceptingNewUsers: z.boolean(),
});

export const createStaffAccountSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  displayName: z.string().min(1, "表示名を入力してください").max(50, "表示名は50文字以内で入力してください"),
  role: z.literal("cast"),
  capacityLimit: z.number().int().positive("上限は正の整数で入力してください").nullable().optional(),
  gender: staffGenderSchema.nullable().optional(),
});

export const resetStaffPasswordSchema = z.object({
  staffId: z.string().uuid(),
});
