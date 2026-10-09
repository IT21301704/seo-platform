"use server";

import { checkWordPressConnection, createWordPressConnection } from "@seo/worker/wordpress";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appUrl, googleHttp } from "@/lib/google";
import { assertCanEdit, logAction, requireProject, requireUser } from "@/lib/session";
import type { SecretState } from "../api/actions";

export interface IntegrationState {
  ok: boolean;
  message: string;
}

/** Creates (or replaces) the WordPress connection key. Shown once; the secret is stored encrypted. */
export async function createWordPressKey(projectId: string): Promise<SecretState> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const { key, integration } = await createWordPressConnection(db, {
    projectId,
    organizationId: user.organizationId,
    userId: user.id,
    appUrl: appUrl(),
  });
  await logAction(db, user, {
    action: "integration.wordpress.key",
    entityType: "integration",
    entityId: integration.id,
  });
  revalidatePath(`/projects/${projectId}/integrations`);
  return {
    ok: true,
    message:
      "Copy this key now; it is shown only once. In WordPress open Settings → SEO Platform, paste it and press Connect, then press Check connection here.",
    secret: key,
  };
}

export async function checkWordPress(projectId: string): Promise<IntegrationState> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const result = await checkWordPressConnection(db, projectId, googleHttp(), () => new Date());
  await logAction(db, user, {
    action: "integration.wordpress.check",
    entityType: "project",
    entityId: projectId,
    after: { ok: result.ok },
  });
  revalidatePath(`/projects/${projectId}/integrations`, "layout");
  return result.ok
    ? {
        ok: true,
        message: `Connected: plugin ${result.status.pluginVersion} with ${result.status.seoPlugin === "core" ? "no SEO plugin" : result.status.seoPlugin === "yoast" ? "Yoast SEO" : "Rank Math"}. Domain ownership is verified.`,
      }
    : { ok: false, message: result.error };
}

export async function disconnectWordPress(projectId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const deleted = await db.integration.deleteMany({ where: { projectId, type: "wordpress" } });
  if (deleted.count) {
    await logAction(db, user, {
      action: "integration.wordpress.disconnect",
      entityType: "project",
      entityId: projectId,
    });
  }
  revalidatePath(`/projects/${projectId}/integrations`, "layout");
}

const RequestSchema = z.object({ tool: z.string().trim().min(2).max(200) });

/** "Need another? Request" and "Notify me": recorded so we can see demand. */
export async function requestIntegration(
  projectId: string,
  _prev: IntegrationState | null,
  formData: FormData,
): Promise<IntegrationState> {
  const { user, db } = await requireUser();
  await requireProject(db, projectId);
  const parsed = RequestSchema.safeParse({ tool: formData.get("tool") });
  if (!parsed.success) return { ok: false, message: "Tell us which tool you use." };
  await logAction(db, user, {
    action: "integration.request",
    entityType: "project",
    entityId: projectId,
    after: { tool: parsed.data.tool },
  });
  return { ok: true, message: `Thanks, we noted ${parsed.data.tool}.` };
}
