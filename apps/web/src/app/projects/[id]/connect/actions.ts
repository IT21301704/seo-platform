"use server";

import { decryptSecret } from "@seo/integrations";
import type { StoredTokens } from "@seo/integrations";
import { enqueueGoogleSync } from "@seo/worker/queue";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { googleHttp, isGoogleType } from "@/lib/google";
import { assertCanEdit, logAction, requireProject, requireUser } from "@/lib/session";

const backPath = (projectId: string, back: string) => `/projects/${projectId}/${back === "monitoring" ? "monitoring" : "sitemap"}`;

/** Chooses the Search Console property or GA4 property and starts the first sync. */
export async function selectProperty(projectId: string, type: string, back: string, formData: FormData): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  if (!isGoogleType(type)) throw new Error("Unknown integration");
  const [externalId, externalName] = String(formData.get("property") ?? "").split("|");
  if (!externalId) throw new Error("Choose a property");
  const integration = await db.integration.findUnique({ where: { projectId_type: { projectId, type } } });
  if (!integration) throw new Error("Connect first");
  await db.integration.update({ where: { id: integration.id }, data: { externalId, externalName: externalName ?? externalId, status: "connected", error: null } });
  await logAction(db, user, { action: `integration.${type}.select_property`, entityType: "integration", entityId: integration.id, after: { externalId } });
  await enqueueGoogleSync({ projectId, organizationId: user.organizationId }, `connect-${Date.now()}`);
  redirect(`${backPath(projectId, back)}?google=connected`);
}

/** Queues a Google sync now (the daily 02:00 sync keeps running too). */
export async function syncNow(projectId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  await enqueueGoogleSync({ projectId, organizationId: user.organizationId }, `manual-${Math.floor(Date.now() / 60_000)}`);
  await logAction(db, user, { action: "integration.sync_now", entityType: "project", entityId: projectId });
  revalidatePath(`/projects/${projectId}/sitemap`);
}

/** Removes the connection, deletes the stored tokens and revokes them at Google. */
export async function disconnect(projectId: string, type: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  if (!isGoogleType(type)) throw new Error("Unknown integration");
  const integration = await db.integration.findUnique({ where: { projectId_type: { projectId, type } } });
  if (!integration) return;
  if (integration.encryptedToken) {
    try {
      const tokens = JSON.parse(decryptSecret(integration.encryptedToken)) as StoredTokens;
      await googleHttp().send({ method: "POST", url: "https://oauth2.googleapis.com/revoke", form: { token: tokens.refreshToken } });
    } catch {
      // Revocation is best effort; the tokens are deleted either way.
    }
  }
  await db.integration.delete({ where: { id: integration.id } });
  await logAction(db, user, { action: `integration.${type}.disconnect`, entityType: "project", entityId: projectId });
  revalidatePath(`/projects/${projectId}/sitemap`);
  revalidatePath(`/projects/${projectId}/monitoring`);
}
