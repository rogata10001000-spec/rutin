import { getStaffList } from "@/actions/admin/staff";
import { StaffTable } from "@/components/admin/staff/StaffTable";
import { getCurrentStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const result = await getStaffList();
  const viewer = await getCurrentStaff();

  if (!result.ok) {
    return (
      <div className="p-4 text-center text-red-600">{result.error.message}</div>
    );
  }

  const viewerRole = viewer?.role === "supervisor" ? "supervisor" : "admin";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">メイト管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          {viewerRole === "supervisor"
            ? "担当として割り当てられたメイトのユーザー向けプロフィールを編集できます"
            : "メイトの招待・情報編集を行います"}
        </p>
      </div>

      <div className="rounded-lg border bg-white">
        <StaffTable items={result.data.items} viewerRole={viewerRole} />
      </div>
    </div>
  );
}
