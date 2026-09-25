import "server-only";
import type { ScopedPrisma } from "@seo/db";
import type { AuditReport, RuleReport } from "@seo/scoring";

export async function latestCompletedCrawl(db: ScopedPrisma, projectId: string) {
  const crawl = await db.crawl.findFirst({
    where: { projectId, status: "completed" },
    orderBy: { createdAt: "desc" },
    include: { report: true },
  });
  if (!crawl?.report) return null;
  return { crawl, report: crawl.report.reportJson as unknown as AuditReport };
}

export async function previousCompletedCrawl(db: ScopedPrisma, projectId: string, beforeCrawlId: string, before: Date) {
  return db.crawl.findFirst({
    where: { projectId, status: "completed", id: { not: beforeCrawlId }, createdAt: { lt: before } },
    orderBy: { createdAt: "desc" },
  });
}

export async function scoreTrend(db: ScopedPrisma, projectId: string, limit = 6) {
  const crawls = await db.crawl.findMany({
    where: { projectId, status: "completed", healthScore: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, createdAt: true, healthScore: true },
  });
  return crawls.reverse().map((c) => ({ date: c.createdAt.toISOString(), score: c.healthScore ?? 0 }));
}

export async function activeCrawl(db: ScopedPrisma, projectId: string) {
  return db.crawl.findFirst({
    where: { projectId, status: { notIn: ["completed", "failed", "cancelled"] } },
    orderBy: { createdAt: "desc" },
  });
}

/** Failing rules sorted by priority (highest first), ties by rule ID. */
export function failingRules(report: AuditReport): RuleReport[] {
  return report.rules
    .filter((r) => r.status === "fail")
    .sort((a, b) => b.priority.priority - a.priority.priority || a.ruleId.localeCompare(b.ruleId));
}

/** Counts of issue items by audit tag, for "Since last audit" and the issue manager header. */
export async function itemTagCounts(db: ScopedPrisma, projectId: string) {
  const groups = await db.issueItem.groupBy({ by: ["auditTag"], where: { projectId }, _count: { _all: true } });
  const counts = { new: 0, still_open: 0, resolved: 0, regressed: 0 };
  for (const g of groups) counts[g.auditTag] = g._count._all;
  return { ...counts, total: counts.new + counts.still_open + counts.resolved + counts.regressed };
}
