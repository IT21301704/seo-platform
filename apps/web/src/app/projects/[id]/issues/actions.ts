"use server";

import type { IssueItemStatus, Prisma } from "@seo/db";
import { mailerFromEnv } from "@seo/worker/notify";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appUrl } from "@/lib/google";
import { assertCanEdit, logAction, requireProject, requireUser } from "@/lib/session";

const STATUSES = ["open", "in_progress", "fixed", "ignored"] as const;

const BulkSchema = z.object({
  action: z.enum(["status", "ignore", "assign", "due"]),
  status: z.enum(STATUSES).optional(),
  reason: z.string().trim().max(500).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("clear")).optional(),
  selection: z.array(z.string()).min(1, "Select at least one item"),
});

export interface BulkResult {
  ok: boolean;
  message: string;
}

/**
 * Bulk actions from the issue manager. Selection values are "item:<id>" or "issue:<id>" (all
 * open items of an issue type). Verified is set only by a passing re-check; Ignored needs a
 * reason (REQUIREMENTS M19).
 */
export async function bulkUpdate(projectId: string, _prev: BulkResult | null, formData: FormData): Promise<BulkResult> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  const project = await requireProject(db, projectId);
  const parsed = BulkSchema.safeParse({
    action: formData.get("action"),
    status: formData.get("status") || undefined,
    reason: formData.get("reason") || undefined,
    assigneeId: formData.get("assigneeId") || undefined,
    dueDate: formData.get("dueDate") || undefined,
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
  let assignee: { id: string; email: string; name: string | null } | null = null;
  if (action === "ignore") {
    if (!parsed.data.reason) return { ok: false, message: "Ignoring needs a reason" };
    data = { status: "ignored", ignoredReason: parsed.data.reason };
  } else if (action === "status") {
    const status = parsed.data.status as IssueItemStatus | undefined;
    if (!status) return { ok: false, message: "Choose a status" };
    if (status === "ignored") return { ok: false, message: "Use Ignore… and give a reason" };
    data = { status, ignoredReason: null };
  } else if (action === "due") {
    if (!parsed.data.dueDate) return { ok: false, message: "Choose a due date" };
    data = { dueDate: parsed.data.dueDate === "clear" ? null : new Date(`${parsed.data.dueDate}T00:00:00Z`) };
  } else {
    const assigneeId = parsed.data.assigneeId && parsed.data.assigneeId !== "none" ? parsed.data.assigneeId : null;
    if (assigneeId) {
      assignee = await db.user.findUnique({ where: { id: assigneeId }, select: { id: true, email: true, name: true } });
      if (!assignee) return { ok: false, message: "Unknown user" };
    }
    data = { assigneeId };
  }

  const result = await db.issueItem.updateMany({ where, data });
  await logAction(db, user, { action: `issues.${action}`, entityType: "issue_item", entityId: projectId, after: { selection, ...(data as Record<string, Prisma.InputJsonValue>) } });

  // Notify the new owner (M19: notifications on assign).
  if (assignee && assignee.id !== user.id && result.count > 0) {
    const link = `${appUrl()}/projects/${projectId}/issues?assignee=${assignee.id}`;
    const title = `${user.name ?? user.email} assigned you ${result.count} issue item${result.count === 1 ? "" : "s"}`;
    await db.notification.create({ data: { organizationId: user.organizationId, userId: assignee.id, type: "assigned", title, body: project.name, link } });
    await mailerFromEnv()
      .send([assignee.email], title, `${title} on ${project.name}.\n\n${link}`)
      .catch(() => undefined);
  }
  revalidatePath(`/projects/${projectId}/issues`);
  return { ok: true, message: `${result.count} item${result.count === 1 ? "" : "s"} updated` };
}

/** Saves the current filters as a named view for this user. */
export async function saveView(projectId: string, query: string, formData: FormData): Promise<void> {
  const { user, db } = await requireUser();
  await requireProject(db, projectId);
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 60);
  if (!name) return;
  await db.savedView.upsert({
    where: { projectId_userId_name: { projectId, userId: user.id, name } },
    create: { organizationId: user.organizationId, projectId, userId: user.id, name, query } as Prisma.SavedViewUncheckedCreateInput,
    update: { query },
  });
  redirect(`/projects/${projectId}/issues${query}`);
}

export async function deleteView(projectId: string, viewId: string): Promise<void> {
  const { user, db } = await requireUser();
  await requireProject(db, projectId);
  await db.savedView.deleteMany({ where: { id: viewId, projectId, userId: user.id } });
  revalidatePath(`/projects/${projectId}/issues`);
}

/** Comment on an issue type; @name or @email mentions notify teammates. */
export async function addComment(projectId: string, issueId: string, _prev: BulkResult | null, formData: FormData): Promise<BulkResult> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  const project = await requireProject(db, projectId);
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, message: "Write a comment first" };
  if (body.length > 5000) return { ok: false, message: "Comments are limited to 5,000 characters" };
  const issue = await db.issue.findUnique({ where: { id: issueId } });
  if (!issue || issue.projectId !== projectId) return { ok: false, message: "Issue not found" };
  const itemId = String(formData.get("itemId") ?? "") || null;

  const users = await db.user.findMany({ select: { id: true, email: true, name: true } });
  const handles = new Set([...body.matchAll(/@([\w.+-]+(?:@[\w.-]+)?)/g)].map((m) => (m[1] ?? "").toLowerCase()));
  const mentioned = users.filter(
    (u) =>
      u.id !== user.id &&
      (handles.has(u.email.toLowerCase()) ||
        handles.has(u.email.split("@")[0]?.toLowerCase() ?? "") ||
        (u.name !== null && handles.has(u.name.replace(/\s+/g, "").toLowerCase()))),
  );

  await db.issueComment.create({
    data: { organizationId: user.organizationId, issueId, itemId, authorId: user.id, body, mentions: mentioned.map((u) => u.id) } as Prisma.IssueCommentUncheckedCreateInput,
  });
  const link = `${appUrl()}/projects/${projectId}/issues/${issue.ruleId}#comments`;
  for (const u of mentioned) {
    const title = `${user.name ?? user.email} mentioned you on ${issue.ruleId}`;
    await db.notification.create({ data: { organizationId: user.organizationId, userId: u.id, type: "mention", title, body: body.slice(0, 300), link } });
    await mailerFromEnv()
      .send([u.email], title, `${body}\n\n${project.name}: ${link}`)
      .catch(() => undefined);
  }
  await logAction(db, user, { action: "issue.comment", entityType: "issue", entityId: issueId, after: { mentions: mentioned.map((u) => u.id) } });
  revalidatePath(`/projects/${projectId}/issues/${issue.ruleId}`);
  return { ok: true, message: mentioned.length ? `Comment added; notified ${mentioned.map((u) => u.name ?? u.email).join(", ")}` : "Comment added" };
}
