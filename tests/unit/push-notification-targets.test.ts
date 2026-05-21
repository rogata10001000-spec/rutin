import { describe, expect, test } from "vitest";
import {
  resolveInboundMessageNotifyStaffIds,
  truncateMessageBody,
} from "@/lib/push-notification-targets";

describe("push-notification-targets", () => {
  test("truncateMessageBody: 80文字以内はそのまま返す", () => {
    expect(truncateMessageBody("こんにちは")).toBe("こんにちは");
  });

  test("truncateMessageBody: 80文字超は省略記号付きで切り詰める", () => {
    const body = "a".repeat(81);
    expect(truncateMessageBody(body)).toBe(`${"a".repeat(80)}...`);
  });

  test("resolveInboundMessageNotifyStaffIds: 担当castとmanagerを統合する", () => {
    const result = resolveInboundMessageNotifyStaffIds({
      assignedCastId: "cast-1",
      managerStaffIds: ["admin-1", "supervisor-1"],
    });

    expect(result).toEqual(["cast-1", "admin-1", "supervisor-1"]);
  });

  test("resolveInboundMessageNotifyStaffIds: cast兼adminは1回だけ通知する", () => {
    const result = resolveInboundMessageNotifyStaffIds({
      assignedCastId: "staff-1",
      managerStaffIds: ["staff-1", "admin-2"],
    });

    expect(result).toEqual(["staff-1", "admin-2"]);
  });

  test("resolveInboundMessageNotifyStaffIds: 担当未割当でもmanagerには通知する", () => {
    const result = resolveInboundMessageNotifyStaffIds({
      assignedCastId: null,
      managerStaffIds: ["admin-1"],
    });

    expect(result).toEqual(["admin-1"]);
  });
});
