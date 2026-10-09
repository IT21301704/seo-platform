import { forOrganization } from "@seo/db";
import { decryptSecret, verifySignedRequest, MAX_SKEW_SECONDS } from "@seo/integrations";
import { createCrawl } from "@seo/worker/crawls";
import { enqueueContentChangeAudit } from "@seo/worker/queue";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prisma, redis } from "@/lib/db";

const ROUTE = "/v1/wordpress/events";
/** A changed page re-checks the site at most once per 10 minutes. */
const BUCKET_MS = 10 * 60_000;

const EventSchema = z.object({
  event: z.enum(["page.updated", "page.deleted"]),
  url: z.string().url().max(2000),
  postId: z.number().int().nonnegative(),
  modified: z.string().max(40),
  site: z.string().url().max(2000),
});

/**
 * Signed webhooks from the WordPress plugin (REQUIREMENTS C2: event-based freshness). The key id
 * header names the connection; its own secret verifies the HMAC; nonces are single-use.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (body.length > 20_000) return apiError(413, "too_large", "Event too large.");
  const keyId = request.headers.get("x-seo-key") ?? "";
  const integration = keyId
    ? await prisma.integration.findUnique({ where: { id: keyId }, include: { project: true } })
    : null;
  if (!integration || integration.type !== "wordpress" || !integration.encryptedToken) {
    return apiError(401, "unknown_key", "Unknown connection.");
  }
  const check = verifySignedRequest(
    decryptSecret(integration.encryptedToken),
    (name) => request.headers.get(name),
    { method: "POST", route: ROUTE, body, now: new Date() },
  );
  if (!check.ok) return apiError(401, "bad_signature", `Signature check failed: ${check.reason}.`);
  // Replay protection: each nonce is accepted once.
  const fresh = await redis.set(
    `wpnonce:${integration.id}:${check.nonce}`,
    "1",
    "EX",
    MAX_SKEW_SECONDS * 2,
    "NX",
  );
  if (fresh !== "OK") return apiError(409, "replayed", "This event was already received.");

  let event: z.infer<typeof EventSchema>;
  try {
    const parsed = EventSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return apiError(400, "bad_request", "Unexpected event body.");
    event = parsed.data;
  } catch {
    return apiError(400, "bad_request", "Body must be JSON.");
  }
  const project = integration.project;
  if (new URL(event.url).host !== new URL(project.rootUrl).host) {
    return apiError(400, "wrong_site", "The page does not belong to this project.");
  }

  const db = forOrganization(prisma, integration.organizationId);
  const bucket = Math.floor(Date.now() / BUCKET_MS);
  const queued = await enqueueContentChangeAudit(project.id, bucket, async () => {
    const crawl = await createCrawl(db, {
      projectId: project.id,
      inputType: "url",
      trigger: "api",
    });
    return { crawlId: crawl.id, organizationId: integration.organizationId };
  });
  await db.auditLog.create({
    data: {
      organizationId: integration.organizationId,
      action: `wordpress.${event.event}`,
      entityType: "project",
      entityId: project.id,
      after: { url: event.url, postId: event.postId, recheckQueued: queued },
      source: "system",
    },
  });
  return Response.json({ received: true, recheckQueued: queued }, { status: 202 });
}
