// Queue contract shared by the web app (producer) and the worker (consumer). No heavy imports.
import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const AUDIT_QUEUE = "audits";

export interface AuditJobData {
  crawlId: string;
  organizationId: string;
}

export function redisConnection(url = process.env["REDIS_URL"] ?? "redis://localhost:6379"): Redis {
  // BullMQ requires maxRetriesPerRequest: null for blocking connections.
  return new Redis(url, { maxRetriesPerRequest: null });
}

let queue: Queue<AuditJobData> | null = null;

export function auditQueue(): Queue<AuditJobData> {
  queue ??= new Queue<AuditJobData>(AUDIT_QUEUE, { connection: redisConnection() });
  return queue;
}

export async function enqueueAudit(data: AuditJobData): Promise<void> {
  await auditQueue().add("audit", data, {
    jobId: data.crawlId,
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}
