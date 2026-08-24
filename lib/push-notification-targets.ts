export function truncateMessageBody(body: string, maxLength = 80): string {
  if (body.length <= maxLength) {
    return body;
  }

  return `${body.slice(0, maxLength)}...`;
}

export function resolveInboundMessageNotifyStaffIds(params: {
  assignedCastId: string | null;
  managerStaffIds: string[];
}): string[] {
  const staffIds = new Set<string>();

  if (params.assignedCastId) {
    staffIds.add(params.assignedCastId);
  }

  for (const staffId of params.managerStaffIds) {
    staffIds.add(staffId);
  }

  return Array.from(staffIds);
}

/**
 * 新規契約通知の管理者側の宛先。
 * 担当メイト本人が admin/supervisor を兼ねる場合、担当向けの1通（行動導線つき）を
 * 優先し、管理者向けの事実通知からは除外する（同じ人に2通送らない）。
 */
export function resolveNewContractManagerIds(params: {
  assignedCastId: string;
  managerStaffIds: string[];
}): string[] {
  return [...new Set(params.managerStaffIds)].filter((id) => id !== params.assignedCastId);
}
