// Worker process: audits, sitemap checks, Google sync, webhook deliveries and the scheduler.
import { PlaywrightRenderer } from "@seo/crawler/playwright";
import { createPrismaClient, forOrganization } from "@seo/db";
import { GuardedJsonHttp } from "@seo/integrations";
import { llmClientFromEnv } from "@seo/llm";
import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import { loadRootEnv, requireEnv } from "./env";
import { syncGoogle } from "./google-sync";
import { mailerFromEnv } from "./notify";
import { registerRules } from "./persist";
import { runPipeline } from "./pipeline";
import { ProgressReporter } from "./progress";
import {
  AUDIT_QUEUE,
  GOOGLE_SYNC_QUEUE,
  SCHEDULER_QUEUE,
  SITEMAP_QUEUE,
  WEBHOOK_QUEUE,
  enqueueWebhookDelivery,
  redisConnection,
} from "./queue";
import type { AuditJobData, GoogleSyncJobData, SitemapJobData, WebhookJobData } from "./queue";
import { schedulerTick } from "./scheduler";
import { runSitemapCheck } from "./sitemap-check";
import { S3BlobStore } from "./storage";
import { sendDelivery } from "./webhooks";

loadRootEnv();
const prisma = createPrismaClient(requireEnv("DATABASE_URL"));
const redis = redisConnection();
const blobs = S3BlobStore.fromEnv();
const llm = llmClientFromEnv();
const http = new GuardedJsonHttp();
const alerts = {
  http,
  mailer: mailerFromEnv(),
  appUrl: process.env["APP_URL"] ?? "http://localhost:3000",
};
const now = () => new Date();
const connection = () => redisConnection();

await registerRules(prisma);

/** Webhook deliveries created by a job are handed to the webhooks queue. */
async function dispatch(deliveryIds: string[], organizationId: string): Promise<void> {
  for (const deliveryId of deliveryIds)
    await enqueueWebhookDelivery({ deliveryId, organizationId });
}

async function pendingDeliveries(organizationId: string, since: Date): Promise<string[]> {
  const rows = await forOrganization(prisma, organizationId).webhookDelivery.findMany({
    where: { status: "pending", createdAt: { gte: since } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

const workers = [
  new Worker<AuditJobData>(
    AUDIT_QUEUE,
    async (job) => {
      const started = new Date();
      const { crawlId, organizationId } = job.data;
      await runPipeline(crawlId, {
        prisma,
        db: forOrganization(prisma, organizationId),
        blobs,
        llm,
        progress: new ProgressReporter(redis, crawlId),
        makeRenderer: (fetcher) => new PlaywrightRenderer(fetcher),
        now,
        llmBudget: Number(process.env["LLM_MAX_CALLS_PER_AUDIT"] ?? 30),
        alerts,
      });
      await dispatch(await pendingDeliveries(organizationId, started), organizationId);
    },
    { connection: connection(), concurrency: Number(process.env["WORKER_CONCURRENCY"] ?? 2) },
  ),
  new Worker<SitemapJobData>(
    SITEMAP_QUEUE,
    async (job) => {
      const { checkId, organizationId } = job.data;
      const ids = await runSitemapCheck(checkId, {
        prisma,
        db: forOrganization(prisma, organizationId),
        blobs,
        now,
      });
      await dispatch(ids, organizationId);
    },
    { connection: connection(), concurrency: 2 },
  ),
  new Worker<GoogleSyncJobData>(
    GOOGLE_SYNC_QUEUE,
    async (job: Job<GoogleSyncJobData>) => {
      const result = await syncGoogle(job.data.projectId, {
        db: forOrganization(prisma, job.data.organizationId),
        http,
        now,
      });
      if (result.errors.length)
        console.warn(`google sync ${job.data.projectId}: ${result.errors.join("; ")}`);
      return result;
    },
    // One project at a time keeps the per-minute URL Inspection limit simple.
    { connection: connection(), concurrency: 1 },
  ),
  new Worker<WebhookJobData>(
    WEBHOOK_QUEUE,
    async (job) =>
      sendDelivery(forOrganization(prisma, job.data.organizationId), job.data.deliveryId, {
        http,
        now,
      }),
    {
      connection: connection(),
      concurrency: 4,
    },
  ),
  new Worker(SCHEDULER_QUEUE, async () => schedulerTick({ prisma, now, alerts }), {
    connection: connection(),
    concurrency: 1,
  }),
];

const scheduler = new Queue(SCHEDULER_QUEUE, { connection: connection() });
await scheduler.upsertJobScheduler(
  "tick",
  { every: 5 * 60_000 },
  { name: "tick", opts: { removeOnComplete: 50, removeOnFail: 50 } },
);

for (const w of workers) {
  w.on("completed", (job) => console.log(`${w.name} ${job.id} completed`));
  w.on("failed", (job, err) => console.error(`${w.name} ${job?.id} failed: ${err.message}`));
}
console.log(
  `Worker listening on queue "${AUDIT_QUEUE}" (+ ${SITEMAP_QUEUE}, ${GOOGLE_SYNC_QUEUE}, ${WEBHOOK_QUEUE}, ${SCHEDULER_QUEUE}); LLM: ${llm ? llm.modelId : "template explanations only"}`,
);

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await scheduler.close();
  await http.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
