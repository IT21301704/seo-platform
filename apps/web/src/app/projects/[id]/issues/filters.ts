import type { Prisma } from "@seo/db";
import { RULES, fixType } from "@seo/rules";
import type { FixType } from "@seo/rules";
import { SEVERITIES, SCORED_CATEGORIES } from "@seo/shared";
import type { Severity } from "@seo/shared";

export const VIEWS = ["grouped", "flat", "page", "board", "source"] as const;
export type View = (typeof VIEWS)[number];
export const STATUS_FILTERS = ["open", "resolved", "ignored", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const SOURCES = ["site_audit", "sitemap_api", "keywords", "monitoring"] as const;
export type SourceFilter = (typeof SOURCES)[number];
export const CATEGORIES = [...SCORED_CATEGORIES, "sitemap"] as const;
export const FIX_TYPES: FixType[] = ["auto-low", "auto-approve", "guide"];
export const SORTS = ["priority", "severity", "newest", "url"] as const;
export type Sort = (typeof SORTS)[number];

export interface IssueFilters {
  view: View;
  q: string;
  severity: Severity | "all";
  status: StatusFilter;
  source: SourceFilter | "all";
  category: (typeof CATEGORIES)[number] | "all";
  fix: FixType | "all";
  /** "all", "none" (unassigned), "me" or a user id. */
  assignee: string;
  /** firstSeen on or after this date (YYYY-MM-DD). */
  since: string;
  /** Only items new in the latest audit. */
  onlyNew: boolean;
  sort: Sort;
  limit: number;
}

const DEFAULTS: IssueFilters = {
  view: "grouped",
  q: "",
  severity: "all",
  status: "open",
  source: "all",
  category: "all",
  fix: "all",
  assignee: "all",
  since: "",
  onlyNew: false,
  sort: "priority",
  limit: 20,
};

const pick = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback);

export function parseFilters(sp: Record<string, string | string[] | undefined>): IssueFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const since = one("since") ?? "";
  return {
    view: pick(one("view"), VIEWS, "grouped"),
    q: (one("q") ?? "").slice(0, 200),
    severity: pick(one("severity"), [...SEVERITIES, "all"] as const, "all"),
    status: pick(one("status"), STATUS_FILTERS, "open"),
    source: pick(one("source"), [...SOURCES, "all"] as const, "all"),
    category: pick(one("category"), [...CATEGORIES, "all"] as const, "all"),
    fix: pick(one("fix"), [...FIX_TYPES, "all"] as const, "all"),
    assignee: /^[a-z0-9]{1,40}$/i.test(one("assignee") ?? "") ? (one("assignee") as string) : "all",
    since: /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : "",
    onlyNew: one("new") === "1",
    sort: pick(one("sort"), SORTS, "priority"),
    limit: Math.min(500, Math.max(10, Number(one("limit")) || 20)),
  };
}

export function toQuery(f: IssueFilters, overrides: Partial<IssueFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const params = new URLSearchParams();
  const keys: (keyof IssueFilters)[] = [
    "view",
    "q",
    "severity",
    "status",
    "source",
    "category",
    "fix",
    "assignee",
    "since",
    "sort",
    "limit",
  ];
  for (const key of keys) {
    const value = merged[key];
    if (value !== DEFAULTS[key] && value !== "") params.set(key, String(value));
  }
  if (merged.onlyNew) params.set("new", "1");
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Item-level WHERE for every filter (server-side, index-backed). */
export function itemWhere(
  projectId: string,
  f: IssueFilters,
  userId = "",
): Prisma.IssueItemWhereInput {
  const where: Prisma.IssueItemWhereInput = { projectId };
  if (f.status === "open") {
    where.auditTag = { not: "resolved" };
    where.status = { in: ["open", "in_progress", "reopened", "fixed"] };
  } else if (f.status === "resolved") where.auditTag = "resolved";
  else if (f.status === "ignored") where.status = "ignored";
  if (f.onlyNew) where.auditTag = "new";
  if (f.q) {
    where.OR = [
      { url: { contains: f.q, mode: "insensitive" } },
      { ruleId: { contains: f.q, mode: "insensitive" } },
      { issue: { title: { contains: f.q, mode: "insensitive" } } },
    ];
  }
  const issue: Prisma.IssueWhereInput = {};
  if (f.severity !== "all") issue.severity = f.severity;
  if (f.source !== "all") issue.source = f.source;
  if (f.category !== "all") issue.category = f.category;
  if (Object.keys(issue).length) where.issue = issue;
  if (f.fix !== "all")
    where.ruleId = { in: RULES.filter((r) => fixType(r) === f.fix).map((r) => r.id) };
  if (f.assignee === "none") where.assigneeId = null;
  else if (f.assignee === "me") where.assigneeId = userId || "__nobody__";
  else if (f.assignee !== "all") where.assigneeId = f.assignee;
  if (f.since) where.firstSeen = { gte: new Date(`${f.since}T00:00:00Z`) };
  return where;
}

export function itemOrder(sort: Sort): Prisma.IssueItemOrderByWithRelationInput[] {
  if (sort === "newest") return [{ firstSeen: "desc" }, { url: "asc" }];
  if (sort === "url") return [{ url: "asc" }, { ruleId: "asc" }];
  if (sort === "severity")
    return [{ issue: { severity: "asc" } }, { ruleId: "asc" }, { url: "asc" }];
  return [{ issue: { priority: "desc" } }, { ruleId: "asc" }, { url: "asc" }];
}
