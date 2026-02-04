"use client";

import { useState } from "react";
import type { PriceOverride, CastListItem } from "@/actions/admin/pricing";
import type { PlanPrice } from "@/actions/admin/plan-prices";
import { PricingTable } from "./PricingTable";
import { PricingForm } from "./PricingForm";
import { PlanPricesTable } from "./PlanPricesTable";

type TabId = "overrides" | "defaults";

type PricingTabsProps = {
  overrides: PriceOverride[];
  casts: CastListItem[];
  planPrices: PlanPrice[];
};

export function PricingTabs({ overrides, casts, planPrices }: PricingTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overrides");

  return (
    <div>
      {/* Tab Navigation */}
      <div className="mb-8 border-b border-stone-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("overrides")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-bold transition-colors ${
              activeTab === "overrides"
                ? "border-terracotta text-terracotta"
                : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-700"
            }`}
          >
            キャスト別価格
          </button>
          <button
            onClick={() => setActiveTab("defaults")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-bold transition-colors ${
              activeTab === "defaults"
                ? "border-terracotta text-terracotta"
                : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-700"
            }`}
          >
            デフォルト価格
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "overrides" && (
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
              <h2 className="mb-4 text-lg font-bold text-stone-800">
                価格オーバーライド追加
              </h2>
              <PricingForm casts={casts} />
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-stone-200 bg-white shadow-soft overflow-hidden">
              <div className="border-b border-stone-200 px-6 py-4 bg-stone-50/50">
                <h2 className="text-lg font-bold text-stone-800">
                  設定済み価格オーバーライド
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  キャストごとに個別の価格を設定できます
                </p>
              </div>
              <PricingTable items={overrides} />
            </div>
          </div>
        </div>
      )}

      {activeTab === "defaults" && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-soft">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-stone-800">
              デフォルトプラン価格
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              キャスト別の上書きがない場合に使用される標準価格です
            </p>
          </div>
          <PlanPricesTable items={planPrices} />
        </div>
      )}
    </div>
  );
}
