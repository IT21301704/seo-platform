// Issue manager sync (REQUIREMENTS M19): one issue per rule, one item per rule × URL, tracked
// across audits by stableKey = ruleId + normalised URL, and tagged New / Still open / Resolved / Regressed.
import type { AuditTag, IssueItemStatus, Prisma, ScopedPrisma } from "@seo/db";
import type { AuditReport } from "@seo/scoring";

type Tx = Parameters<Parameters<ScopedPrisma["$transaction"]>[0]>[0];

export const stableKey = (ruleId: string, url: string | null): string =>
  `${ruleId}|${url ?? "site"}`;

const OPEN_STATES: IssueItemStatus[] = ["open", "in_progress", "reopened", "fixed"];

export interface ItemTransition {
  status: IssueItemStatus;
  auditTag: AuditTag;
  regressed: boolean;
}

/** What happens to an existing item that fails again in this audit. */
export function stillFailing(current: {
  status: IssueItemStatus;
  auditTag: AuditTag;
}): ItemTransition {
  if (current.status === "ignored")
    return { status: "ignored", auditTag: "still_open", regressed: false };
  if (current.status === "verified" || current.auditTag === "resolved") {
    return { status: "reopened", auditTag: "regressed", regressed: true };
  }
  // "Fixed" but the re-check failed → back to open.
  if (current.status === "fixed")
    return { status: "open", auditTag: "still_open", regressed: false };
  return { status: current.status, auditTag: "still_open", regressed: false };
}

/** What happens to an existing item that no longer fails: the rule re-ran and passed. */
export function nowPassing(current: {
  status: IssueItemStatus;
}): Pick<ItemTransition, "status" | "auditTag"> {
  return { status: current.status === "ignored" ? "ignored" : "verified", auditTag: "resolved" };
}

export async function syncIssues(
  tx: Tx,
  args: { projectId: string; crawlId: string; report: AuditReport; now: Date },
): Promise<void> {
  const { projectId, crawlId, report, now } = args;
  const existingIssues = await tx.issue.findMany({ where: { projectId } });
  const issueByRule = new Map(existingIssues.map((i) => [i.ruleId, i]));
  const existingItems = await tx.issueItem.findMany({ where: { projectId } });
  const itemByKey = new Map(existingItems.map((i) => [i.stableKey, i]));
  const failingKeys = new Set<string>();

  for (const rule of report.rules) {
    const failing = rule.outcomes.filter((o) => o.result === "fail");
    if (failing.length === 0 && !issueByRule.has(rule.ruleId)) continue;
    const data = {
      title: rule.title,
      category: rule.category,
      severity: rule.severity,
      priority: rule.priority.priority,
      lastCrawlId: crawlId,
    };
    const issue = await tx.issue.upsert({
      where: { projectId_ruleId: { projectId, ruleId: rule.ruleId } },
      create: { projectId, ruleId: rule.ruleId, ...data } as Prisma.IssueUncheckedCreateInput,
      update: data,
    });

    for (const outcome of failing) {
      const key = stableKey(rule.ruleId, outcome.url);
      failingKeys.add(key);
      const existing = itemByKey.get(key);
      const evidence = outcome.evidence as Prisma.InputJsonValue;
      if (!existing) {
        await tx.issueItem.create({
          data: {
            projectId,
            issueId: issue.id,
            stableKey: key,
            ruleId: rule.ruleId,
            url: outcome.url ?? report.rootUrl,
            status: "open",
            auditTag: "new",
            evidence,
            lastCrawlId: crawlId,
            firstSeen: now,
            lastSeen: now,
          } as Prisma.IssueItemUncheckedCreateInput,
        });
        continue;
      }
      const next = stillFailing(existing);
      await tx.issueItem.update({
        where: { id: existing.id },
        data: {
          status: next.status,
          auditTag: next.auditTag,
          evidence,
          lastCrawlId: crawlId,
          lastSeen: now,
          ...(next.regressed ? { regressedAt: now } : {}),
        },
      });
    }
  }

  for (const item of existingItems) {
    if (failingKeys.has(item.stableKey) || item.auditTag === "resolved") continue;
    await tx.issueItem.update({
      where: { id: item.id },
      data: { ...nowPassing(item), lastCrawlId: crawlId },
    });
  }

  // Refresh open/total counts per issue.
  const items = await tx.issueItem.findMany({
    where: { projectId },
    select: { issueId: true, status: true, auditTag: true },
  });
  const counts = new Map<string, { open: number; total: number }>();
  for (const i of items) {
    const c = counts.get(i.issueId) ?? { open: 0, total: 0 };
    c.total += 1;
    if (OPEN_STATES.includes(i.status) && i.auditTag !== "resolved") c.open += 1;
    counts.set(i.issueId, c);
  }
  for (const [issueId, c] of counts) {
    await tx.issue.update({
      where: { id: issueId },
      data: { openCount: c.open, totalCount: c.total },
    });
  }
}
