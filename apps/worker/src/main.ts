// Worker process: consumes audit jobs from BullMQ.
import { PlaywrightRenderer } from "@seo/crawler/playwright";
import { createPrismaClient, forOrganization } from "@seo/db";
import { llmClientFromEnv } from "@seo/llm";
import { Worker } from "bullmq";
import { loadRootEnv, requireEnv } from "./env";
import { registerRules } from "./persist";
import { runPipeline } from "./pipeline";
import { ProgressReporter } from "./progress";
import { AUDIT_QUEUE, redisConnection } from "./queue";
import type { AuditJobData } from "./queue";
import { S3BlobStore } from "./storage";

loadRootEnv();
const prisma = createPrismaClient(requireEnv("DATABASE_URL"));
const redis = redisConnection();
const blobs = S3BlobStore.fromEnv();
const llm = llmClientFromEnv();

await registerRules(prisma);

const worker = new Worker<AuditJobData>(
  AUDIT_QUEUE,
  async (job) => {
    const { crawlId, organizationId } = job.data;
    await runPipeline(crawlId, {
      prisma,
      db: forOrganization(prisma, organizationId),
      blobs,
      llm,
      progress: new ProgressReporter(redis, crawlId),
      makeRenderer: (fetcher) => new PlaywrightRenderer(fetcher),
      now: () => new Date(),
      llmBudget: Number(process.env["LLM_MAX_CALLS_PER_AUDIT"] ?? 30),
    });
  },
  { connection: redisConnection(), concurrency: Number(process.env["WORKER_CONCURRENCY"] ?? 2) },
);

worker.on("completed", (job) => console.log(`audit ${job.data.crawlId} completed`));
worker.on("failed", (job, err) => console.error(`audit ${job?.data.crawlId} failed: ${err.message}`));
console.log(`Worker listening on queue "${AUDIT_QUEUE}" (LLM: ${llm ? llm.modelId : "template explanations only"})`);

const shutdown = async () => {
  await worker.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
