"use server";

import { createCrawl } from "@seo/worker/crawls";
import { enqueueAudit } from "@seo/worker/queue";
import { redirect } from "next/navigation";
import { activeCrawl } from "@/lib/queries";
import { assertCanEdit, logAction, requireProject, requireUser } from "@/lib/session";

/** "Run audit": queue a new crawl for the project and open the progress screen. */
export async function startAudit(projectId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  const project = await requireProject(db, projectId);
  const running = await activeCrawl(db, project.id);
  if (running) redirect(`/projects/${project.id}/audits/${running.id}`);
  const crawl = await createCrawl(db, { projectId: project.id, inputType: "url" });
  await enqueueAudit({ crawlId: crawl.id, organizationId: user.organizationId });
  await logAction(db, user, { action: "audit.start", entityType: "crawl", entityId: crawl.id });
  redirect(`/projects/${project.id}/audits/${crawl.id}`);
}

/** Cancel a queued or running audit (the worker stops at the next stage boundary). */
export async function cancelAudit(projectId: string, crawlId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  await db.crawl.updateMany({
    where: { id: crawlId, projectId, status: { notIn: ["completed", "failed", "cancelled"] } },
    data: { status: "cancelled", finishedAt: new Date() },
  });
  await logAction(db, user, { action: "audit.cancel", entityType: "crawl", entityId: crawlId });
  redirect(`/projects/${projectId}`);
}
