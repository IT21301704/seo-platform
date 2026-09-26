// Outgoing webhooks (REQUIREMENTS M17: sitemap.check.completed). Signed with HMAC-SHA256 over
// "<timestamp>.<body>"; receivers should reject timestamps older than 5 minutes (replay protection).
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma, ScopedPrisma } from "@seo/db";
import { decryptSecret } from "@seo/integrations";
import type { JsonHttp } from "@seo/integrations";

export const WEBHOOK_EVENTS = ["sitemap.check.completed", "audit.completed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Receiver-side check (documented for API users; used in tests). */
export function verifySignature(
  secret: string,
  header: string,
  body: string,
  nowSeconds: number,
): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts["t"]);
  if (!Number.isFinite(t) || Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS || !parts["v1"])
    return false;
  const expected = signPayload(secret, t, body).split("v1=")[1] ?? "";
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts["v1"], "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Records one delivery per enabled webhook; the "webhooks" queue sends them with retries. */
export async function queueWebhookEvent(
  db: ScopedPrisma,
  projectId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const hooks = await db.webhook.findMany({
    where: { projectId, enabled: true, events: { has: event } },
  });
  const ids: string[] = [];
  for (const hook of hooks) {
    const delivery = await db.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        event,
        payload: payload as Prisma.InputJsonValue,
        status: "pending",
      } as Prisma.WebhookDeliveryUncheckedCreateInput,
    });
    ids.push(delivery.id);
  }
  return ids;
}

/** Sends one delivery. Throws on failure so the queue retries with backoff. */
export async function sendDelivery(
  db: ScopedPrisma,
  deliveryId: string,
  deps: { http: JsonHttp; now: () => Date },
): Promise<void> {
  const delivery = await db.webhookDelivery.findUniqueOrThrow({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (delivery.status === "delivered") return;
  const body = JSON.stringify({
    id: delivery.id,
    event: delivery.event,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.payload,
  });
  const timestamp = Math.floor(deps.now().getTime() / 1000);
  const signature = signPayload(decryptSecret(delivery.webhook.encryptedSecret), timestamp, body);
  let status = 0;
  let error: string | null = null;
  try {
    const res = await deps.http.send({
      method: "POST",
      url: delivery.webhook.url,
      headers: {
        "x-seo-event": delivery.event,
        "x-seo-delivery": delivery.id,
        "x-seo-signature": signature,
        "idempotency-key": randomUUID(),
      },
      json: JSON.parse(body),
    });
    status = res.status;
    if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
  } catch (e) {
    error = (e as Error).message.slice(0, 500);
  }
  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      attempts: { increment: 1 },
      responseStatus: status || null,
      lastError: error,
      status: error ? "failed" : "delivered",
      deliveredAt: error ? null : deps.now(),
    },
  });
  if (error) throw new Error(`Webhook delivery failed: ${error}`);
}
