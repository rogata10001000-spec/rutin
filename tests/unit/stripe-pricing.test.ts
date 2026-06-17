import { describe, it, expect, vi, beforeEach } from "vitest";

const productsSearch = vi.fn();
const productsCreate = vi.fn();
const pricesList = vi.fn();
const pricesCreate = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    products: {
      search: (...a: unknown[]) => productsSearch(...a),
      create: (...a: unknown[]) => productsCreate(...a),
    },
    prices: {
      list: (...a: unknown[]) => pricesList(...a),
      create: (...a: unknown[]) => pricesCreate(...a),
    },
  },
}));

import { ensureRecurringPrice } from "@/lib/stripe-pricing";

beforeEach(() => {
  productsSearch.mockReset();
  productsCreate.mockReset();
  pricesList.mockReset();
  pricesCreate.mockReset();
});

describe("ensureRecurringPrice", () => {
  it("同額・同間隔の既存Priceがあれば再利用し、新規作成しない", async () => {
    productsSearch.mockResolvedValue({ data: [{ id: "prod_1" }] });
    pricesList.mockResolvedValue({
      data: [
        { id: "price_year", currency: "jpy", unit_amount: 69800, recurring: { interval: "year" } },
        { id: "price_month", currency: "jpy", unit_amount: 6980, recurring: { interval: "month" } },
      ],
    });

    const id = await ensureRecurringPrice("standard", 6980, "month");
    expect(id).toBe("price_month");
    expect(pricesCreate).not.toHaveBeenCalled();
    expect(productsCreate).not.toHaveBeenCalled();
  });

  it("Productが無ければ作成し、一致するPriceが無ければ金額どおりに作成する", async () => {
    productsSearch.mockResolvedValue({ data: [] });
    productsCreate.mockResolvedValue({ id: "prod_new" });
    pricesList.mockResolvedValue({ data: [] });
    pricesCreate.mockResolvedValue({ id: "price_created" });

    const id = await ensureRecurringPrice("premium", 148000, "year");
    expect(id).toBe("price_created");
    expect(productsCreate).toHaveBeenCalledTimes(1);
    // 金額(unit_amount)と間隔が入力どおりであること（＝表示額=請求額の担保）
    const args = pricesCreate.mock.calls[0][0] as {
      unit_amount: number;
      currency: string;
      recurring: { interval: string };
    };
    expect(args.unit_amount).toBe(148000);
    expect(args.currency).toBe("jpy");
    expect(args.recurring.interval).toBe("year");
  });

  it("金額が0以下なら例外", async () => {
    await expect(ensureRecurringPrice("light", 0, "month")).rejects.toThrow();
    await expect(ensureRecurringPrice("light", -100, "month")).rejects.toThrow();
  });
});
