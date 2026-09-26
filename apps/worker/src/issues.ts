// Issue manager sync (REQUIREMENTS M19): one issue per rule, one item per rule × URL, tracked
// across audits by stableKey = ruleId + normalised URL, and tagged New / Still open / Resolved / Regressed.
import type { AuditTag, IssueItemStatus, IssueSource, Prisma, ScopedPrisma } from "@seo/db";
import type { AuditReport } from "@seo/scoring";

type Tx = Parameters<Parameters<ScopedPrisma["$transaction"]>[0]>[0];

export const stableKey = (ruleId: string, url: string | null): string => `${ruleId}|${url ?? "site"}`;

const OPEN_STATES: IssueItemStatus[] = ["open", "in_progress", "reopened", "fixed"];

export interface ItemTransition {
  status: IssueItemStatus;
  auditTag: AuditTag;
  regressed: boolean;
}

/** What happens to an existing item that fails again in this audit. */
export function stillFailing(current: { status: IssueItemStatus; auditTag: AuditTag }): ItemTransition {
  if (current.status === "ignored") return { status: "ignored", auditTag: "still_open", regressed: false };
  if (current.status === "verified" || current.auditTag === "resolved") {
    return { status: "reopened", auditTag: "regressed", regressed: true };
  }
  // "Fixed" but the re-check failed → back to open.
  if (current.status === "fixed") return { status: "open", auditTag: "still_open", regressed: false };
  return { status: current.status, auditTag: "still_open", regressed: false };
}

/** What happens to an existing item that no longer fails: the rule re-ran and passed. */
export function nowPassing(current: { status: IssueItemStatus }): Pick<ItemTransition, "status" | "auditTag"> {
  return { status: current.status === "ignored" ? "ignored" : "verified", auditTag: "resolved" };
}

export interface SyncArgs {
  projectId: string;
  crawlId: string;
  report: AuditReport;
  now: Date;
  /** Who produced these results (issue manager "Source"). */
  source: IssueSource;
  /** Only these rules are synced (a sitemap check must not resolve on-page items). Default: all. */
  ruleIds?: ReadonlySet<string>;
}

export interface SyncResult {
  created: number;
  resolved: number;
  /** Items that came back after being resolved (for notifications). */
  regressed: { itemId: string; ruleId: string; url: string; assigneeId: string | null }[];
}

const groupKey = (t: ItemTransition): string => `${t.status}|${t.auditTag}|${t.regressed}`;

/** Batched so a sync stays fast with tens of thousands of items. */
export async function syncIssues(tx: Tx, args: SyncArgs): Promise<SyncResult> {
  const { projectId, crawlId, report, now, source } = args;
  const inScope = (ruleId: string) => !args.ruleIds || args.ruleIds.has(ruleId);
  const existingIssues = await tx.issue.findMany({ where: { projectId } });
  const issueByRule = new Map(existingIssues.map((i) => [i.ruleId, i]));
  const existingItems = (await tx.issueItem.findMany({ where: { projectId } })).filter((i) => inScope(i.ruleId));
  const itemByKey = new Map(existingItems.map((i) => [i.stableKey, i]));
  const failingKeys = new Set<string>();
  const creates: Prisma.IssueItemCreateManyInput[] = [];
  const transitions = new Map<string, { t: ItemTransition; ids: string[] }>();
  const regressed: SyncResult["regressed"] = [];

  for (const rule of report.rules.filter((r) => inScope(r.ruleId))) {
    const failing = rule.outcomes.filter((o) => o.result === "fail");
    if (failing.length === 0 && !issueByRule.has(rule.ruleId)) continue;
    const data = {
      title: rule.title,
      category: rule.category,
      severity: rule.severity,
      priority: rule.priority.priority,
      lastCrawlId: crawlId,
      ...(failing.length > 0 ? { source } : {}),
    };
    const issue = await tx.issue.upsert({
      where: { projectId_ruleId: { projectId, ruleId: rule.ruleId } },
      create: { projectId, ruleId: rule.ruleId, ...data, source } as Prisma.IssueUncheckedCreateInput,
      update: data,
    });

    for (const outcome of failing) {
      const key = stableKey(rule.ruleId, outcome.url);
      failingKeys.add(key);
      const existing = itemByKey.get(key);
      const evidence = outcome.evidence as Prisma.InputJsonValue;
      if (!existing) {
        creates.push({
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
        } as Prisma.IssueItemCreateManyInput);
        continue;
      }
      const t = stillFailing(existing);
      const group = transitions.get(groupKey(t)) ?? { t, ids: [] };
      group.ids.push(existing.id);
      transitions.set(groupKey(t), group);
      if (t.regressed) regressed.push({ itemId: existing.id, ruleId: rule.ruleId, url: existing.url, assigneeId: existing.assigneeId });
      if (JSON.stringify(existing.evidence) !== JSON.stringify(outcome.evidence)) {
        await tx.issueItem.update({ where: { id: existing.id }, data: { evidence } });
      }
    }
  }

  if (creates.length) await tx.issueItem.createMany({ data: creates });
  for (const { t, ids } of transitions.values()) {
    await tx.issueItem.updateMany({
      where: { id: { in: ids } },
      data: { status: t.status, auditTag: t.auditTag, lastCrawlId: crawlId, lastSeen: now, ...(t.regressed ? { regressedAt: now } : {}) },
    });
  }

  const passing = existingItems.filter((i) => !failingKeys.has(i.stableKey) && i.auditTag !== "resolved");
  for (const status of ["verified", "ignored"] as const) {
    const ids = passing.filter((i) => nowPassing(i).status === status).map((i) => i.id);
    if (ids.length) await tx.issueItem.updateMany({ where: { id: { in: ids } }, data: { status, auditTag: "resolved", lastCrawlId: crawlId } });
  }

  // Refresh open/total counts per issue.
  const grouped = await tx.issueItem.groupBy({ by: ["issueId", "status", "auditTag"], where: { projectId }, _count: { _all: true } });
  const counts = new Map<string, { open: number; total: number }>();
  for (const g of grouped) {
    const c = counts.get(g.issueId) ?? { open: 0, total: 0 };
    c.total += g._count._all;
    if (OPEN_STATES.includes(g.status) && g.auditTag !== "resolved") c.open += g._count._all;
    counts.set(g.issueId, c);
  }
  for (const [issueId, c] of counts) {
    await tx.issue.update({ where: { id: issueId }, data: { openCount: c.open, totalCount: c.total } });
  }
  return { created: creates.length, resolved: passing.length, regressed };
}
