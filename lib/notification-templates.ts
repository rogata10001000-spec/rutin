import { getServerEnv } from "@/lib/env";
import type { UserNotification } from "@/lib/notifications";

function planPageUrl(): string {
  return `${getServerEnv().APP_BASE_URL.replace(/\/$/, "")}/account/plan`;
}

function formatJaDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function wrapHtml(bodyHtml: string): string {
  const url = planPageUrl();
  return `
    <div style="font-family: sans-serif; line-height: 1.7; color: #1c1917;">
      ${bodyHtml}
      <p style="margin: 24px 0;">
        <a href="${url}"
           style="display: inline-block; background: #e11d74; color: #fff;
                  padding: 12px 24px; border-radius: 9999px; font-weight: bold;
                  text-decoration: none;">
          契約・プランを確認する
        </a>
      </p>
      <p style="font-size: 12px; color: #78716c;">
        ボタンが押せない場合はこちら: <a href="${url}">${url}</a>
      </p>
    </div>
  `;
}

/** 支払い失敗（past_due） */
export function paymentFailedNotification(): UserNotification {
  const url = planPageUrl();
  const lineText = [
    "お支払いの確認ができませんでした。",
    "お手数ですが、お支払い方法をご確認のうえ、更新をお願いいたします。",
    "",
    `確認はこちら: ${url}`,
  ].join("\n");

  return {
    lineText,
    email: {
      subject: "【Rutin】お支払いの確認のお願い",
      text: lineText,
      html: wrapHtml(
        `<p>お支払いの確認ができませんでした。</p>
         <p>お手数ですが、お支払い方法をご確認のうえ、更新をお願いいたします。</p>`
      ),
    },
  };
}

/** 解約完了（canceled） */
export function subscriptionCanceledNotification(): UserNotification {
  const lineText = [
    "ご解約の手続きが完了しました。",
    "これまでご利用いただき、ありがとうございました。",
    "またのご利用を心よりお待ちしております。",
  ].join("\n");

  return {
    lineText,
    email: {
      subject: "【Rutin】ご解約の手続きが完了しました",
      text: lineText,
      html: wrapHtml(
        `<p>ご解約の手続きが完了しました。</p>
         <p>これまでご利用いただき、ありがとうございました。またのご利用を心よりお待ちしております。</p>`
      ),
    },
  };
}

/** 解約予約を受付（期間終了時に解約） */
export function cancelScheduledNotification(periodEndIso: string | null): UserNotification {
  const endDate = formatJaDate(periodEndIso);
  const periodLine = endDate
    ? `${endDate}まではこれまで通りご利用いただけます。`
    : "現在の期間が終了するまではこれまで通りご利用いただけます。";

  const lineText = [
    "解約予約を受け付けました。",
    periodLine,
    "期間終了日に自動的に解約されます。",
    "解約を取り消したい場合は、契約・プランページからお手続きください。",
  ].join("\n");

  return {
    lineText,
    email: {
      subject: "【Rutin】解約予約を受け付けました",
      text: lineText,
      html: wrapHtml(
        `<p>解約予約を受け付けました。</p>
         <p>${periodLine}期間終了日に自動的に解約されます。</p>
         <p>解約を取り消したい場合は、契約・プランページからお手続きください。</p>`
      ),
    },
  };
}
