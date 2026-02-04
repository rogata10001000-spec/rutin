"use client";

import { useState } from "react";
import type { PlanAdmin } from "@/actions/admin/plans";
import { EditPlanDialog } from "./EditPlanDialog";

type PlansTableProps = {
  items: PlanAdmin[];
};

const planNameConfig: Record<string, { label: string; className: string }> = {
  light: { label: "Light", className: "bg-stone-100 text-stone-600" },
  standard: { label: "Standard", className: "bg-sage/20 text-sage-800" },
  premium: { label: "Premium", className: "bg-terracotta/10 text-terracotta" },
};

function formatMinutesToHours(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}時間${mins}分` : `${hours}時間`;
  }
  return `${minutes}分`;
}

export function PlansTable({ items }: PlansTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanAdmin | null>(null);

  const handleEditClick = (plan: PlanAdmin) => {
    setSelectedPlan(plan);
    setDialogOpen(true);
  };

  if (items.length === 0) {
    return (
      <div className="p-12 text-center text-stone-500 bg-white rounded-2xl border border-stone-200">
        プランが登録されていません
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  プラン
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  返信SLA
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  警告閾値
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  優先度
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  負荷係数
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  チェックイン
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  週次レビュー
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-stone-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white">
              {items.map((item) => {
                const config = planNameConfig[item.planCode] ?? {
                  label: item.name,
                  className: "bg-stone-100 text-stone-600",
                };
                return (
                  <tr key={item.planCode} className="transition-colors hover:bg-stone-50/50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${config.className}`}
                      >
                        {config.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-900">
                      {formatMinutesToHours(item.replySlaMinutes)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                      残り{formatMinutesToHours(item.slaWarningMinutes)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                      {item.priorityLevel}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600">
                      ×{item.capacityWeight}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          item.dailyCheckinEnabled
                            ? "bg-sage/20 text-sage-800"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {item.dailyCheckinEnabled ? "有効" : "無効"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          item.weeklyReviewEnabled
                            ? "bg-sage/20 text-sage-800"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {item.weeklyReviewEnabled ? "有効" : "無効"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <button
                        onClick={() => handleEditClick(item)}
                        className="rounded-lg px-3 py-1 text-xs font-bold text-terracotta hover:bg-terracotta/10"
                      >
                        編集
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <EditPlanDialog
        open={dialogOpen}
        plan={selectedPlan}
        onClose={() => {
          setDialogOpen(false);
          setSelectedPlan(null);
        }}
      />
    </>
  );
}
