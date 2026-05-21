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
