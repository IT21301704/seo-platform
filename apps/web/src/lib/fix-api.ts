import "server-only";
import { batchLabel, displayValue } from "./fixes";
import type { ApiPrincipal } from "./api";

/** A batch the principal may see (same organization, and same project for API keys). */
export async function findBatch(principal: ApiPrincipal, batchId: string) {
  const batch = await principal.db.fixBatch.findUnique({
    where: { id: batchId },
    include: { fixes: { orderBy: [{ url: "asc" }, { createdAt: "asc" }] } },
  });
  if (!batch || (principal.projectId && batch.projectId !== principal.projectId)) return null;
  return batch;
}

type Batch = NonNullable<Awaited<ReturnType<typeof findBatch>>>;

/** Public JSON of a fix batch (REQUIREMENTS M17 fix endpoints). */
export function batchJson(batch: Batch) {
  return {
    batchId: batch.id,
    number: batchLabel(batch.number),
    ruleId: batch.ruleId,
    kind: batch.kind,
    risk: batch.risk,
    state: batch.state,
    target: batch.target,
    targetDetail: batch.targetDetail,
    sitemapCheckId: batch.sitemapCheckId,
    createdAt: batch.createdAt.toISOString(),
    approvedAt: batch.approvedAt?.toISOString() ?? null,
    publishedAt: batch.publishedAt?.toISOString() ?? null,
    verifiedAt: batch.verifiedAt?.toISOString() ?? null,
    rolledBackAt: batch.rolledBackAt?.toISOString() ?? null,
    nextVerifyAt: batch.nextVerifyAt?.toISOString() ?? null,
    error: batch.state === "generating" ? null : batch.error,
    fixes: batch.fixes.map((f) => ({
      fixId: f.id,
      url: f.url,
      target: f.targetRef,
      current: displayValue(f.kind, f.currentValue),
      proposed: f.newValue,
      recheck: f.recheck,
      approved: f.approved,
      state: f.state,
      oldValue: f.oldValueRead ? f.oldValue : undefined,
      verification: f.verification,
      error: f.error,
    })),
  };
}
