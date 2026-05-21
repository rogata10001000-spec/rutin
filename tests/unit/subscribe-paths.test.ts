import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    APP_BASE_URL: "https://example.com",
  }),
}));

import { buildSubscribeCastUrl, buildSubscribePlanUrl } from "@/lib/subscribe-paths";

describe("lib/subscribe-paths", () => {
  it("buildSubscribeCastUrl preserves query params", () => {
    expect(buildSubscribeCastUrl({ canceled: "1", gender: "female" })).toBe(
      "/subscribe/cast?canceled=1&gender=female"
    );
  });

  it("buildSubscribePlanUrl preserves extra params", () => {
    const url = buildSubscribePlanUrl("cast-uuid", "gender=male&canceled=1");
    expect(url).toContain("castId=cast-uuid");
    expect(url).toContain("gender=male");
    expect(url).toContain("canceled=1");
  });
});
