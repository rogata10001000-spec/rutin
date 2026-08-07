import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { resolvePlanLabels } from "@/lib/funnel-copy";
import { PlanLabelsProvider } from "@/components/common/PlanLabelsProvider";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // プラン名は /admin/preview で改名できるため、管理画面でも設定値を正とする
  // （コード内のラベルマップを見ると改名後に旧名が残る）。60秒キャッシュ済み。
  const [staff, planLabels] = await Promise.all([getCurrentStaff(), resolvePlanLabels()]);

  if (!staff) {
    redirect("/login");
  }

  return (
    <PlanLabelsProvider labels={planLabels}>
      <AppShell
        staffId={staff.id}
        staffName={staff.displayName}
        staffRole={staff.role}
      >
        {children}
      </AppShell>
    </PlanLabelsProvider>
  );
}
