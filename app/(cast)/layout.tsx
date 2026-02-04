import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";

export default async function CastLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect("/login");
  }

  // キャスト以外はアクセス不可（管理者/SVは別のルートを使用）
  if (staff.role !== "cast") {
    redirect("/admin/staff");
  }

  return (
    <AppShell
      staffId={staff.id}
      staffName={staff.displayName}
      staffRole={staff.role}
    >
      {children}
    </AppShell>
  );
}
