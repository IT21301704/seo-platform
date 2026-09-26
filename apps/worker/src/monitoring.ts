// Monitoring (REQUIREMENTS M10): what changed since the previous audit, and which alerts fire.
// Pure functions of two deterministic reports.
import type { AuditReport } from "@seo/scoring";

export type EventLevel = "critical" | "alert" | "high" | "ok" | "info";

export interface EventDraft {
  type: string;
  level: EventLevel;
  message: string;
  data: Record<string, string | number | string[] | null>;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function failingKeys(
  report: AuditReport,
  filter: (ruleId: string, severity: string) => boolean,
): Set<string> {
  const keys = new Set<string>();
  for (const r of report.rules) {
    if (!filter(r.ruleId, r.severity)) continue;
    for (const o of r.outcomes) if (o.result === "fail") keys.add(`${r.ruleId}|${o.url ?? "site"}`);
  }
  return keys;
}

/** Internal broken links as "page → target" pairs (from LNK-002 evidence). */
function brokenLinks(report: AuditReport): Set<string> {
  const pairs = new Set<string>();
  for (const o of report.rules.find((r) => r.ruleId === "LNK-002")?.outcomes ?? []) {
    const links = (o.evidence["brokenLinks"] ?? []) as { url: string }[];
    for (const l of links) pairs.add(`${o.url} → ${l.url}`);
  }
  return pairs;
}

/** Every fetched URL (TEC-003 has one outcome per crawled URL). */
function crawledUrls(report: AuditReport): Set<string> {
  return new Set(
    (report.rules.find((r) => r.ruleId === "TEC-003")?.outcomes ?? []).map((o) => o.url ?? ""),
  );
}

const diff = <T>(a: Set<T>, b: Set<T>): T[] => [...a].filter((x) => !b.has(x));

export function diffAudits(previous: AuditReport | null, next: AuditReport): EventDraft[] {
  if (!previous) {
    return [
      {
        type: "baseline",
        level: "info",
        message: `First audit: Health Score ${next.score.health ?? "—"}`,
        data: { score: next.score.health },
      },
    ];
  }
  const events: EventDraft[] = [];
  const from = previous.score.health;
  const to = next.score.health;
  if (from !== null && to !== null && to !== from) {
    events.push(
      to < from
        ? {
            type: "score_drop",
            level: "alert",
            message: `Score dropped ${plural(from - to, "point")} (${from} → ${to})`,
            data: { from, to, delta: to - from },
          }
        : {
            type: "score_rise",
            level: "info",
            message: `Score rose ${plural(to - from, "point")} (${from} → ${to})`,
            data: { from, to, delta: to - from },
          },
    );
  }

  const newNoindex = diff(
    failingKeys(next, (id) => id === "IDX-003"),
    failingKeys(previous, (id) => id === "IDX-003"),
  );
  if (newNoindex.length) {
    events.push({
      type: "became_noindex",
      level: "critical",
      message: `${plural(newNoindex.length, "page")} became noindex`,
      data: { urls: newNoindex.map((k) => k.split("|")[1] ?? "").sort() },
    });
  }
  const isCritical = (id: string, severity: string) => severity === "critical" && id !== "IDX-003";
  const newCritical = diff(failingKeys(next, isCritical), failingKeys(previous, isCritical));
  if (newCritical.length) {
    events.push({
      type: "new_critical",
      level: "critical",
      message: `${plural(newCritical.length, "new critical issue")}`,
      data: { items: newCritical.sort() },
    });
  }
  const newBroken = diff(brokenLinks(next), brokenLinks(previous));
  if (newBroken.length) {
    events.push({
      type: "new_broken_links",
      level: "high",
      message: `${plural(newBroken.length, "new broken link")} detected`,
      data: { links: newBroken.sort() },
    });
  }
  const added = diff(crawledUrls(next), crawledUrls(previous));
  const removed = diff(crawledUrls(previous), crawledUrls(next));
  if (added.length)
    events.push({
      type: "pages_added",
      level: "info",
      message: `${plural(added.length, "new page")} found`,
      data: { urls: added.sort() },
    });
  if (removed.length)
    events.push({
      type: "pages_removed",
      level: "info",
      message: `${plural(removed.length, "page")} no longer found`,
      data: { urls: removed.sort() },
    });

  if (!events.some((e) => e.level === "critical" || e.level === "alert" || e.level === "high")) {
    const bad = next.counts.critical + next.counts.high;
    events.push({
      type: "healthy",
      level: "ok",
      message:
        bad === 0
          ? `${plural(next.pages.indexable, "page")} healthy, no new issues`
          : "No new issues since the last audit",
      data: { indexable: next.pages.indexable },
    });
  }
  return events;
}

export interface RuleSetting {
  type: "score_drop" | "new_critical" | "noindex" | "weekly_summary";
  enabled: boolean;
  threshold: number | null;
}

export const DEFAULT_SCORE_DROP_THRESHOLD = 5;

/** Alert rules triggered by these events (weekly_summary is scheduled separately). */
export function triggeredAlerts(
  events: EventDraft[],
  rules: RuleSetting[],
): { type: RuleSetting["type"]; message: string }[] {
  const out: { type: RuleSetting["type"]; message: string }[] = [];
  for (const rule of rules.filter((r) => r.enabled)) {
    if (rule.type === "score_drop") {
      const threshold = rule.threshold ?? DEFAULT_SCORE_DROP_THRESHOLD;
      const drop = events.find(
        (e) => e.type === "score_drop" && -Number(e.data["delta"]) > threshold,
      );
      if (drop) out.push({ type: "score_drop", message: drop.message });
    }
    if (rule.type === "new_critical") {
      const critical = events.filter((e) => e.level === "critical");
      if (critical.length)
        out.push({ type: "new_critical", message: critical.map((e) => e.message).join("; ") });
    }
    if (rule.type === "noindex") {
      const noindex = events.find((e) => e.type === "became_noindex");
      if (noindex) out.push({ type: "noindex", message: noindex.message });
    }
  }
  return out;
}
