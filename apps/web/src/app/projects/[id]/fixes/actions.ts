"use server";

import type { WpValue } from "@seo/integrations";
import {
  FixError,
  approveFixBatch,
  editFixValue,
  reapplyFixBatch,
  rollbackFixes,
} from "@seo/worker/fixes";
import { enqueueFixJob } from "@seo/worker/queue";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { googleHttp } from "@/lib/google";
import { startFixBatch } from "@/lib/fixes";
import { S3BlobStore } from "@seo/worker/storage";
import { assertCanEdit, requireProject, requireUser } from "@/lib/session";

export interface FixActionState {
  ok: boolean;
  message: string;
}

const fail = (error: unknown): FixActionState => ({
  ok: false,
  message:
    error instanceof FixError ? error.message : `Something went wrong: ${(error as Error).message}`,
});

/** "Generate & preview fix" (issue detail, fixes list). */
export async function generateFix(projectId: string, ruleId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const result = await startFixBatch(db, user, projectId, ruleId);
  if ("error" in result)
    redirect(`/projects/${projectId}/fixes?error=${encodeURIComponent(result.error)}`);
  redirect(`/projects/${projectId}/fixes/${result.id}`);
}

/** "Regenerate all": a fresh preview for the same rule; the old unpublished preview is removed. */
export async function regenerateBatch(projectId: string, batchId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const batch = await db.fixBatch.findFirstOrThrow({ where: { id: batchId, projectId } });
  if (batch.state !== "preview" && batch.state !== "failed")
    redirect(`/projects/${projectId}/fixes/${batchId}`);
  const result = await startFixBatch(db, user, projectId, batch.ruleId, {
    sitemapCheckId: batch.sitemapCheckId ?? undefined,
  });
  if ("error" in result) redirect(`/projects/${projectId}/fixes/${batchId}`);
  await db.fixBatch.deleteMany({ where: { id: batchId, publishedAt: null } });
  redirect(`/projects/${projectId}/fixes/${result.id}`);
}

/** Inline edit in the review table; the rule engine re-checks every draft of the batch. */
export async function editFix(
  projectId: string,
  batchId: string,
  fixId: string,
  _prev: FixActionState | null,
  formData: FormData,
): Promise<FixActionState> {
  try {
    const { user, db } = await requireUser();
    assertCanEdit(user);
    await requireProject(db, projectId);
    const raw = String(formData.get("value") ?? "").trim();
    const fix = await db.fix.findFirstOrThrow({ where: { id: fixId, batchId, projectId } });
    const value: WpValue =
      fix.kind === "redirect" ? { to: raw, status: 301 } : raw === "" ? null : raw;
    const updated = await editFixValue(fixId, value, user.id, { db, blobs: S3BlobStore.fromEnv() });
    revalidatePath(`/projects/${projectId}/fixes/${batchId}`);
    return updated.recheck === "pass"
      ? { ok: true, message: "Saved · passes the re-check" }
      : { ok: false, message: `Saved · re-check: ${updated.recheck}` };
  } catch (error) {
    return fail(error);
  }
}

/** "Approve N & publish": approve the ticked changes and queue publishing. */
export async function publishBatch(
  projectId: string,
  batchId: string,
  _prev: FixActionState | null,
  formData: FormData,
): Promise<FixActionState> {
  try {
    const { user, db } = await requireUser();
    assertCanEdit(user);
    await requireProject(db, projectId);
    const ids = formData.getAll("fix").map(String);
    const result = await approveFixBatch(batchId, ids, user.id, { db, now: () => new Date() });
    await enqueueFixJob({ batchId, organizationId: user.organizationId, action: "apply" });
    revalidatePath(`/projects/${projectId}/fixes/${batchId}`);
    return { ok: true, message: `${result.approved} change(s) approved; publishing now.` };
  } catch (error) {
    return fail(error);
  }
}

async function rollback(
  projectId: string,
  batchId: string,
  fixIds: string[] | null,
): Promise<FixActionState> {
  try {
    const { user, db } = await requireUser();
    assertCanEdit(user);
    await requireProject(db, projectId);
    await db.fixBatch.findFirstOrThrow({ where: { id: batchId, projectId } });
    const result = await rollbackFixes(batchId, fixIds, user.id, {
      db,
      http: googleHttp(),
      now: () => new Date(),
    });
    revalidatePath(`/projects/${projectId}/changes`);
    if (result.failed.length) {
      return {
        ok: false,
        message: `${result.rolledBack} rolled back; ${result.failed.length} not: ${result.failed[0]?.error}`,
      };
    }
    return {
      ok: true,
      message: `${result.rolledBack} change(s) rolled back to the saved old value.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function rollbackBatch(projectId: string, batchId: string): Promise<FixActionState> {
  return rollback(projectId, batchId, null);
}

export async function rollbackFix(
  projectId: string,
  batchId: string,
  fixId: string,
): Promise<FixActionState> {
  return rollback(projectId, batchId, [fixId]);
}

export async function reapplyBatch(projectId: string, batchId: string): Promise<FixActionState> {
  try {
    const { user, db } = await requireUser();
    assertCanEdit(user);
    await requireProject(db, projectId);
    await db.fixBatch.findFirstOrThrow({ where: { id: batchId, projectId } });
    await reapplyFixBatch(batchId, user.id, { db, now: () => new Date() });
    await enqueueFixJob({ batchId, organizationId: user.organizationId, action: "apply" });
    revalidatePath(`/projects/${projectId}/changes`);
    return { ok: true, message: "Publishing the same values again." };
  } catch (error) {
    return fail(error);
  }
}
