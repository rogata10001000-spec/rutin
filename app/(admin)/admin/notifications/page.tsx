import { getNewMemberNotifyRecipients } from "@/actions/admin/notifications";
import { NotificationSettings } from "@/components/admin/notifications/NotificationSettings";
import { ErrorState } from "@/components/common/ErrorState";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const result = await getNewMemberNotifyRecipients();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">通知設定</h1>
        <p className="mt-1 text-sm text-stone-500">
          運営向けのLINE通知の宛先を管理します。
        </p>
      </div>

      {result.ok ? (
        <NotificationSettings initial={result.data.recipients} />
      ) : (
        <ErrorState title="通知設定を読み込めませんでした" message={result.error.message} />
      )}
    </div>
  );
}
