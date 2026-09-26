// Queue contract shared by the web app (producer) and the worker (consumer). No heavy imports.
import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const AUDIT_QUEUE = "audits";
export const SITEMAP_QUEUE = "sitemap-checks";
export const GOOGLE_SYNC_QUEUE = "google-sync";
export const WEBHOOK_QUEUE = "webhooks";
export const SCHEDULER_QUEUE = "scheduler";

export interface AuditJobData {
  crawlId: string;
  organizationId: string;
}
export interface SitemapJobData {
  checkId: string;
  organizationId: string;
}
export interface GoogleSyncJobData {
  projectId: string;
  organizationId: string;
}
export interface WebhookJobData {
  deliveryId: string;
  organizationId: string;
}

export function redisConnection(url = process.env["REDIS_URL"] ?? "redis://localhost:6379"): Redis {
  // BullMQ requires maxRetriesPerRequest: null for blocking connections.
  return new Redis(url, { maxRetriesPerRequest: null });
}

const queues = new Map<string, Queue>();
function queue<T>(name: string): Queue<T> {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: redisConnection() });
    queues.set(name, q);
  }
  return q as Queue<T>;
}

export const auditQueue = (): Queue<AuditJobData> => queue<AuditJobData>(AUDIT_QUEUE);

const keep = { removeOnComplete: 200, removeOnFail: 500 };

export async function enqueueAudit(data: AuditJobData): Promise<void> {
  await queue<AuditJobData>(AUDIT_QUEUE).add("audit", data, {
    jobId: data.crawlId,
    attempts: 1,
    ...keep,
  });
}

export async function enqueueSitemapCheck(data: SitemapJobData): Promise<void> {
  await queue<SitemapJobData>(SITEMAP_QUEUE).add("sitemap-check", data, {
    jobId: data.checkId,
    attempts: 1,
    ...keep,
  });
}

/** BullMQ rejects custom job IDs that contain ":" (it uses ":" in its own Redis keys). */
export function googleSyncJobId(projectId: string, dedupeKey: string): string {
  return `${projectId}--${dedupeKey}`.replaceAll(":", "-");
}

/** One sync per project per key (e.g. local date), so repeated triggers do not double-spend quota. */
export async function enqueueGoogleSync(data: GoogleSyncJobData, dedupeKey: string): Promise<void> {
  await queue<GoogleSyncJobData>(GOOGLE_SYNC_QUEUE).add("google-sync", data, {
    jobId: googleSyncJobId(data.projectId, dedupeKey),
    attempts: 2,
    backoff: { type: "exponential", delay: 60_000 },
    ...keep,
  });
}

/** Webhook deliveries retry with exponential backoff (1 min, 2 min, 4 min, 8 min). */
export async function enqueueWebhookDelivery(data: WebhookJobData): Promise<void> {
  await queue<WebhookJobData>(WEBHOOK_QUEUE).add("deliver", data, {
    jobId: data.deliveryId,
    attempts: 5,
    backoff: { type: "exponential", delay: 60_000 },
    ...keep,
  });
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
