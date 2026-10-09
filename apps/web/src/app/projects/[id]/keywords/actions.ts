"use server";

import type { Prisma } from "@seo/db";
import { draftPageBrief, llmClientFromEnv } from "@seo/llm";
import { DbLlmCache } from "@seo/worker/llm-cache";
import { enqueueKeywordRefresh } from "@seo/worker/queue";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { briefInput } from "@/lib/keyword-brief";
import { loadKeywordData } from "@/lib/keywords";
import { assertCanEdit, logAction, requireProject, requireUser } from "@/lib/session";

export interface KeywordState {
  ok: boolean;
  message: string;
}

const KeywordSchema = z.string().trim().toLowerCase().min(2).max(200);

async function refresh(projectId: string, organizationId: string): Promise<void> {
  revalidatePath(`/projects/${projectId}/keywords`);
  // KWD-001 depends on the map: recompute keyword issues.
  await enqueueKeywordRefresh({ projectId, organizationId }).catch(() => undefined);
}

/** Sets the primary keyword of a page (the owner's choice replaces the automatic one). */
export async function setPrimaryKeyword(
  projectId: string,
  url: string,
  _prev: KeywordState | null,
  formData: FormData,
): Promise<KeywordState> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const keyword = KeywordSchema.safeParse(formData.get("keyword"));
  if (!keyword.success) return { ok: false, message: "Enter a keyword (2–200 characters)." };
  const role = formData.get("role") === "secondary" ? "secondary" : "primary";
  await db.$transaction(async (tx) => {
    if (role === "primary") {
      await tx.keywordPageMap.updateMany({
        where: { projectId, url, role: "primary" },
        data: { role: "secondary" },
      });
    }
    // One page per keyword: the owner's choice moves it from any other page.
    await tx.keywordPageMap.deleteMany({
      where: { projectId, keyword: keyword.data, url: { not: url } },
    });
    await tx.keywordPageMap.upsert({
      where: { projectId_url_keyword: { projectId, url, keyword: keyword.data } },
      create: {
        organizationId: user.organizationId,
        projectId,
        url,
        keyword: keyword.data,
        role,
        source: "user",
      } as Prisma.KeywordPageMapUncheckedCreateInput,
      update: { role, source: "user" },
    });
    // A page edited by the owner keeps only owner entries.
    await tx.keywordPageMap.updateMany({
      where: { projectId, url, source: "auto" },
      data: { source: "user" },
    });
  });
  await logAction(db, user, {
    action: "keywords.map.set",
    entityType: "project",
    entityId: projectId,
    after: { url, keyword: keyword.data, role },
  });
  await refresh(projectId, user.organizationId);
  return { ok: true, message: `Saved "${keyword.data}" as ${role}.` };
}

export async function removeMapEntry(projectId: string, entryId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const entry = await db.keywordPageMap.findFirst({ where: { id: entryId, projectId } });
  if (!entry) return;
  await db.keywordPageMap.delete({ where: { id: entryId } });
  await logAction(db, user, {
    action: "keywords.map.remove",
    entityType: "project",
    entityId: projectId,
    before: { url: entry.url, keyword: entry.keyword },
  });
  await refresh(projectId, user.organizationId);
}

/** "Save to keyword map": the suggested (automatic) mapping becomes the owner's own. */
export async function saveKeywordMap(projectId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const result = await db.keywordPageMap.updateMany({
    where: { projectId, source: "auto" },
    data: { source: "user" },
  });
  await logAction(db, user, {
    action: "keywords.map.save",
    entityType: "project",
    entityId: projectId,
    after: { entries: result.count },
  });
  await refresh(projectId, user.organizationId);
}

/** "Create page brief" for a content gap (Claude, cached; the owner reviews it). */
export async function createPageBrief(
  projectId: string,
  clusterName: string,
): Promise<KeywordState> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  const project = await requireProject(db, projectId);
  const llm = llmClientFromEnv();
  if (!llm)
    return {
      ok: false,
      message: "No AI model is configured (ANTHROPIC_API_KEY), so briefs cannot be drafted.",
    };
  const data = await loadKeywordData(db, project, { seed: "", country: null });
  const gap = data?.gaps.find((g) => g.name === clusterName);
  if (!data || !gap)
    return { ok: false, message: "This content gap is no longer in the latest data." };
  const brief = await draftPageBrief(await briefInput(db, project, data, gap), {
    llm,
    cache: new DbLlmCache(db),
  });
  await logAction(db, user, {
    action: "keywords.brief",
    entityType: "project",
    entityId: projectId,
    after: { cluster: clusterName },
  });
  revalidatePath(`/projects/${projectId}/keywords`);
  return brief
    ? { ok: true, message: "Brief drafted below." }
    : { ok: false, message: "The AI model did not return a valid brief. Try again." };
}
