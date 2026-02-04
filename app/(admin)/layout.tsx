import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect("/login");
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
