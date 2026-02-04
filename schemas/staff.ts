import { z } from "zod";

export const upsertStaffProfileSchema = z.object({
  staffId: z.string().uuid(),
  displayName: z.string().min(1, "表示名を入力してください"),
  role: z.enum(["admin", "supervisor", "cast"]),
  capacityLimit: z.number().int().positive().nullable().optional(),
  active: z.boolean(),
  acceptingNewUsers: z.boolean().optional(),
});

export const setCastAcceptingSchema = z.object({
  castId: z.string().uuid(),
  acceptingNewUsers: z.boolean(),
});

export const inviteStaffSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  displayName: z.string().min(1, "表示名を入力してください").max(50, "表示名は50文字以内で入力してください"),
  role: z.enum(["admin", "supervisor", "cast"]),
  capacityLimit: z.number().int().positive("上限は正の整数で入力してください").nullable().optional(),
});
