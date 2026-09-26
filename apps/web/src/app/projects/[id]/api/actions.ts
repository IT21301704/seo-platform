"use server";

import { randomBytes } from "node:crypto";
import { assertSafeUrl } from "@seo/crawler";
import type { Prisma } from "@seo/db";
import { encryptSecret } from "@seo/integrations";
import { WEBHOOK_EVENTS } from "@seo/worker/webhooks";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { API_SCOPES, generateApiKey } from "@/lib/api";
import { assertCanEdit, logAction, requireProject, requireUser } from "@/lib/session";

export interface SecretState {
  ok: boolean;
  message: string;
  /** Shown exactly once. */
  secret?: string;
}

const KeySchema = z.object({ name: z.string().trim().min(1, "Give the key a name").max(80), scopes: z.array(z.enum(API_SCOPES)).min(1, "Choose at least one scope") });

export async function createApiKey(projectId: string, _prev: SecretState | null, formData: FormData): Promise<SecretState> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const parsed = KeySchema.safeParse({ name: formData.get("name"), scopes: formData.getAll("scopes") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { key, prefix, hash } = generateApiKey();
  const row = await db.apiKey.create({
    data: { organizationId: user.organizationId, projectId, name: parsed.data.name, prefix, hashedKey: hash, scopes: parsed.data.scopes, createdById: user.id } as Prisma.ApiKeyUncheckedCreateInput,
  });
  await logAction(db, user, { action: "api_key.create", entityType: "api_key", entityId: row.id, after: { name: row.name, scopes: row.scopes } });
  revalidatePath(`/projects/${projectId}/api`);
  return { ok: true, message: "Copy the key now. It will not be shown again.", secret: key };
}

export async function revokeApiKey(projectId: string, keyId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  await db.apiKey.updateMany({ where: { id: keyId, projectId, revokedAt: null }, data: { revokedAt: new Date() } });
  await logAction(db, user, { action: "api_key.revoke", entityType: "api_key", entityId: keyId });
  revalidatePath(`/projects/${projectId}/api`);
}

const HookSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Enter a full https:// URL")
    .refine((u) => u.startsWith("https://"), "Webhooks must use https"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Choose at least one event"),
});

export async function createWebhook(projectId: string, _prev: SecretState | null, formData: FormData): Promise<SecretState> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const parsed = HookSchema.safeParse({ url: formData.get("url"), events: formData.getAll("events") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    assertSafeUrl(parsed.data.url); // private addresses are rejected here and again at delivery time
  } catch {
    return { ok: false, message: "That address is not allowed (private or local network)." };
  }
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const row = await db.webhook.create({
    data: { organizationId: user.organizationId, projectId, url: parsed.data.url, events: parsed.data.events, encryptedSecret: encryptSecret(secret) } as Prisma.WebhookUncheckedCreateInput,
  });
  await logAction(db, user, { action: "webhook.create", entityType: "webhook", entityId: row.id, after: { url: row.url, events: row.events } });
  revalidatePath(`/projects/${projectId}/api`);
  return { ok: true, message: "Copy the signing secret now. It will not be shown again.", secret };
}

export async function deleteWebhook(projectId: string, webhookId: string): Promise<void> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  await db.webhook.deleteMany({ where: { id: webhookId, projectId } });
  await logAction(db, user, { action: "webhook.delete", entityType: "webhook", entityId: webhookId });
  revalidatePath(`/projects/${projectId}/api`);
}
