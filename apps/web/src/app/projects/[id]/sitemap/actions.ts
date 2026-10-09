"use server";

import { SITEMAP_FIX_RULE_IDS } from "@seo/fixes";
import { createSitemapCheck } from "@seo/worker/crawls";
import { enqueueSitemapCheck } from "@seo/worker/queue";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { startFixBatch } from "@/lib/fixes";
import { assertCanEdit, logAction, requireProject, requireUser } from "@/lib/session";

/** "Run check" / "Re-check sitemap": queue a sitemap check (the same job the API starts). */
export async function runSitemapCheckAction(
  projectId: string,
  returnTo: "sitemap" | "urls",
): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const running = await db.sitemapCheck.findFirst({
    where: { projectId, status: { in: ["queued", "running"] } },
  });
  if (!running) {
    const check = await createSitemapCheck(db, projectId, "manual");
    await enqueueSitemapCheck({ checkId: check.id, organizationId: user.organizationId });
    await logAction(db, user, {
      action: "sitemap_check.start",
      entityType: "sitemap_check",
      entityId: check.id,
    });
  }
  redirect(`/projects/${projectId}/sitemap${returnTo === "urls" ? "/urls" : ""}`);
}

/** Ticks / unticks "added" on a manual-list URL (carried over to later checks). */
export async function toggleAdded(projectId: string, urlId: string, added: boolean): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const row = await db.sitemapUrl.findUnique({
    where: { id: urlId },
    include: { check: { select: { projectId: true } } },
  });
  if (!row || row.check.projectId !== projectId || row.listType !== "manual_add")
    throw new Error("Not found");
  await db.sitemapUrl.update({ where: { id: urlId }, data: { added } });
  await logAction(db, user, {
    action: added ? "sitemap_url.mark_added" : "sitemap_url.unmark_added",
    entityType: "sitemap_url",
    entityId: urlId,
    after: { url: row.url },
  });
  revalidatePath(`/projects/${projectId}/sitemap/urls`);
}

/**
 * "Fix N automatically" (M17 auto-fix): one preview batch per failing sitemap rule that has an
 * automatic fix, built from this check. Nothing is published until each batch is approved.
 */
export async function fixSitemapAction(projectId: string, checkId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const check = await db.sitemapCheck.findFirstOrThrow({ where: { id: checkId, projectId } });
  const failing = ((check.results ?? []) as { ruleId: string; status: string }[])
    .filter((r) => r.status === "fail" && SITEMAP_FIX_RULE_IDS.includes(r.ruleId))
    .map((r) => r.ruleId);
  const ids: string[] = [];
  for (const ruleId of failing) {
    const result = await startFixBatch(db, user, projectId, ruleId, { sitemapCheckId: check.id });
    if ("id" in result) ids.push(result.id);
  }
  redirect(
    ids.length === 1 ? `/projects/${projectId}/fixes/${ids[0]}` : `/projects/${projectId}/fixes`,
  );
}
