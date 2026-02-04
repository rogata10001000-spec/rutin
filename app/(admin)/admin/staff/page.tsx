import { getStaffList } from "@/actions/admin/staff";
import { StaffTable } from "@/components/admin/staff/StaffTable";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const result = await getStaffList();

  if (!result.ok) {
    return (
      <div className="p-4 text-center text-red-600">{result.error.message}</div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">キャスト管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          キャストの招待・情報編集を行います
        </p>
      </div>

      <div className="rounded-lg border bg-white">
        <StaffTable items={result.data.items} />
      </div>
    </div>
  );
}
