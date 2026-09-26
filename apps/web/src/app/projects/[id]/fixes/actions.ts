"use server";

import { redirect } from "next/navigation";
import { loadDescriptionPreview } from "@/lib/fixes";
import { assertCanEdit, logAction, requireProject, requireUser } from "@/lib/session";

/** Asks Claude for drafts (cached); nothing is published in Phase 1. */
export async function generateDrafts(projectId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const preview = await loadDescriptionPreview(db, projectId, true);
  if (preview) {
    await logAction(db, user, {
      action: "fix.preview.generate",
      entityType: "crawl",
      entityId: preview.crawlId,
      after: { ruleId: "ONP-004" },
    });
  }
  redirect(`/projects/${projectId}/fixes/preview-onp-004`);
}
