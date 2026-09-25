"use server";

import type { IssueItemStatus, Prisma } from "@seo/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCanEdit, logAction, requireProject, requireUser } from "@/lib/session";

const STATUSES = ["open", "in_progress", "fixed", "ignored"] as const;

const BulkSchema = z.object({
  action: z.enum(["status", "ignore", "assign"]),
  status: z.enum(STATUSES).optional(),
  reason: z.string().trim().max(500).optional(),
  assigneeId: z.string().optional(),
  selection: z.array(z.string()).min(1, "Select at least one item"),
});

export interface BulkResult {
  ok: boolean;
  message: string;
}

/**
 * Bulk actions from the issue manager. Selection values are "item:<id>" or "issue:<id>" (all
 * open items of an issue type). Workflow limits: Verified is set only by a passing re-check,
 * and Ignored requires a reason (REQUIREMENTS M19).
 */
export async function bulkUpdate(projectId: string, _prev: BulkResult | null, formData: FormData): Promise<BulkResult> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const parsed = BulkSchema.safeParse({
    action: formData.get("action"),
    status: formData.get("status") || undefined,
    reason: formData.get("reason") || undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    selection: formData.getAll("selection").map(String),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { action, selection } = parsed.data;

  const itemIds = selection.filter((s) => s.startsWith("item:")).map((s) => s.slice(5));
  const issueIds = selection.filter((s) => s.startsWith("issue:")).map((s) => s.slice(6));
  const where: Prisma.IssueItemWhereInput = {
    projectId,
    OR: [{ id: { in: itemIds } }, { issueId: { in: issueIds }, auditTag: { not: "resolved" } }],
  };

  let data: Prisma.IssueItemUncheckedUpdateManyInput;
  if (action === "ignore") {
    if (!parsed.data.reason) return { ok: false, message: "Ignoring needs a reason" };
    data = { status: "ignored", ignoredReason: parsed.data.reason };
  } else if (action === "status") {
    const status = parsed.data.status as IssueItemStatus | undefined;
    if (!status) return { ok: false, message: "Choose a status" };
    if (status === "ignored") return { ok: false, message: "Use Ignore… and give a reason" };
    data = { status, ignoredReason: null };
  } else {
    const assigneeId = parsed.data.assigneeId && parsed.data.assigneeId !== "none" ? parsed.data.assigneeId : null;
    if (assigneeId && !(await db.user.findUnique({ where: { id: assigneeId } }))) return { ok: false, message: "Unknown user" };
    data = { assigneeId };
  }

  const result = await db.issueItem.updateMany({ where, data });
  await logAction(db, user, {
    action: `issues.${action}`,
    entityType: "issue_item",
    entityId: projectId,
    after: { selection, ...(data as Record<string, Prisma.InputJsonValue>) },
  });
  revalidatePath(`/projects/${projectId}/issues`);
  return { ok: true, message: `${result.count} item${result.count === 1 ? "" : "s"} updated` };
}
