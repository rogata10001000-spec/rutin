import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { pushTextMessage } from "@/lib/line";
import { getSendAccountForEndUser } from "@/lib/line-accounts";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>;

export type UserEmailContent = {
  subject: string;
  text: string;
  html?: string;
};

export type UserNotification = {
  /** LINEプッシュ本文。null/未指定ならLINEは送らない。 */
  lineText?: string | null;
  /** メール内容。null/未指定ならメールは送らない。 */
  email?: UserEmailContent | null;
};

export type NotifyResult = { line: boolean; email: boolean };

/**
 * end_user に LINE とメールを独立に best-effort で送信する。
 * - 片方の送信が失敗しても、もう片方は送る（LINE障害時の保険）。
 * - 連絡先（line_user_id / email）が無い経路はスキップする。
 */
export async function notifyUser(
  supabase: SupabaseAdmin,
  endUserId: string,
  notification: UserNotification
): Promise<NotifyResult> {
  const { data: user } = await supabase
    .from("end_users")
    .select("line_user_id, email")
    .eq("id", endUserId)
    .maybeSingle();

  let lineSent = false;
  let emailSent = false;

  if (user?.line_user_id && notification.lineText) {
    try {
      const sendAccount = await getSendAccountForEndUser(endUserId, supabase);
      await pushTextMessage(sendAccount.credentials, user.line_user_id, notification.lineText);
      lineSent = true;
    } catch (err) {
      logger.error("notifyUser: LINE push failed", {
        endUserId,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  if (user?.email && notification.email) {
    const res = await sendEmail({
      to: user.email,
      subject: notification.email.subject,
      text: notification.email.text,
      html: notification.email.html,
    });
    emailSent = res.ok;
  }

  return { line: lineSent, email: emailSent };
}
