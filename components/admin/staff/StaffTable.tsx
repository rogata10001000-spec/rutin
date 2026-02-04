"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StaffMember } from "@/actions/admin/staff";
import { setCastAcceptingStatus } from "@/actions/admin/staff";
import { useToast } from "@/components/common/Toast";
import { InviteStaffDialog } from "./InviteStaffDialog";
import { EditStaffDialog } from "./EditStaffDialog";

type StaffTableProps = {
  items: StaffMember[];
};

const roleConfig = {
  admin: { label: "管理者", className: "bg-stone-800 text-stone-50" },
  supervisor: { label: "SV", className: "bg-sage text-white" },
  cast: { label: "キャスト", className: "bg-terracotta text-white" },
};

export function StaffTable({ items }: StaffTableProps) {
  const router = useRouter();
  const { showToast, ToastContainer } = useToast();
  const [toggling, setToggling] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  const handleToggleAccepting = async (castId: string, current: boolean) => {
    setToggling(castId);
    try {
      const result = await setCastAcceptingStatus({
        castId,
        acceptingNewUsers: !current,
      });

      if (result.ok) {
        showToast(
          result.data.acceptingNewUsers
            ? "新規受付を開始しました"
            : "新規受付を停止しました",
          "success"
        );
        router.refresh();
      } else {
        showToast(result.error.message, "error");
      }
    } catch {
      showToast("更新に失敗しました", "error");
    } finally {
      setToggling(null);
    }
  };

  const handleEditClick = (staff: StaffMember) => {
    setSelectedStaff(staff);
    setEditOpen(true);
  };

  return (
    <>
      {/* Header with Add Button */}
      <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-white rounded-t-2xl">
        <div>
          <h2 className="text-lg font-bold text-stone-800">キャスト一覧</h2>
          <p className="text-sm text-stone-500">{items.length}人</p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#d0694e] focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          キャストを招待
        </button>
      </div>

      {items.length === 0 ? (
        <div className="p-12 text-center text-stone-500 bg-white rounded-b-2xl border-x border-b border-stone-200">
          キャストが登録されていません
        </div>
      ) : (
        <div className="overflow-hidden rounded-b-2xl border-x border-b border-stone-200 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    名前
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    ロール
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    状態
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    担当ユーザー
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    上限
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    新規受付
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {items.map((item) => {
                  const role = roleConfig[item.role];
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-stone-50/50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-stone-900">
                        {item.displayName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${role.className}`}
                        >
                          {role.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            item.active
                              ? "bg-sage/20 text-sage-800"
                              : "bg-stone-100 text-stone-500"
                          }`}
                        >
                          {item.active ? "有効" : "無効"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                        {item.role === "cast" ? `${item.assignedUserCount}人` : "-"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                        {item.role === "cast" && item.capacityLimit
                          ? `${item.capacityLimit}人`
                          : "-"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {item.role === "cast" && (
                          <button
                            onClick={() =>
                              handleToggleAccepting(item.id, item.acceptingNewUsers)
                            }
                            disabled={toggling === item.id}
                            className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
                              item.acceptingNewUsers
                                ? "bg-sage/20 text-sage-800 hover:bg-sage/30"
                                : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                            }`}
                          >
                            {item.acceptingNewUsers ? "受付中" : "停止中"}
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditClick(item)}
                            className="rounded-lg px-3 py-1 text-xs font-bold text-terracotta hover:bg-terracotta/10"
                          >
                            編集
                          </button>
                          {item.role === "cast" && (
                            <Link
                              href={`/admin/staff/${item.id}/photos`}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              写真管理
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ToastContainer />

      {/* Dialogs */}
      <InviteStaffDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
      <EditStaffDialog
        open={editOpen}
        staff={selectedStaff}
        onClose={() => {
          setEditOpen(false);
          setSelectedStaff(null);
        }}
      />
    </>
  );
}
