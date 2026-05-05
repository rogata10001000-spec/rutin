import { z } from "zod";

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().max(500).nullable().optional(),
  platform: z.string().max(120).nullable().optional(),
});

export const pushSubscriptionEndpointSchema = z.object({
  endpoint: z.string().url(),
});
