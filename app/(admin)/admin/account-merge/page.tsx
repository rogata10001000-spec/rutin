import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AccountMergePanel } from "@/components/admin/AccountMergePanel";

export const dynamic = "force-dynamic";

export default async function AccountMergePage() {
  const auth = await requireAdmin();
  if (!auth) {
    redirect("/inbox");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">アカウント統合</h1>
        <p className="mt-1 text-sm text-stone-500">
          同一人物が複数のアカウント（LINE・メール）に分かれている場合に、1つへ統合できます。
          統合元のデータは統合先へ移動し、統合元は削除されます。
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
        <AccountMergePanel />
      </div>
    </div>
  );
}
