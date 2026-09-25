import type { Prisma } from "@seo/db";
import { SEVERITIES } from "@seo/shared";
import type { Severity } from "@seo/shared";

export type StatusFilter = "open" | "resolved" | "ignored" | "all";
export type View = "grouped" | "flat";

export interface IssueFilters {
  view: View;
  q: string;
  severity: Severity | "all";
  status: StatusFilter;
  limit: number;
}

const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export function parseFilters(sp: Record<string, string | string[] | undefined>): IssueFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  return {
    view: pick(one("view"), ["grouped", "flat"] as const, "grouped"),
    q: (one("q") ?? "").slice(0, 200),
    severity: pick(one("severity"), [...SEVERITIES, "all"] as const, "all"),
    status: pick(one("status"), ["open", "resolved", "ignored", "all"] as const, "open"),
    limit: Math.min(500, Math.max(10, Number(one("limit")) || 20)),
  };
}

export function toQuery(f: IssueFilters, overrides: Partial<IssueFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const params = new URLSearchParams();
  if (merged.view !== "grouped") params.set("view", merged.view);
  if (merged.q) params.set("q", merged.q);
  if (merged.severity !== "all") params.set("severity", merged.severity);
  if (merged.status !== "open") params.set("status", merged.status);
  if (merged.limit !== 20) params.set("limit", String(merged.limit));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Item-level WHERE for the chosen status and search (URL, folder, rule ID or title). */
export function itemWhere(projectId: string, f: IssueFilters): Prisma.IssueItemWhereInput {
  const status: Prisma.IssueItemWhereInput =
    f.status === "open"
      ? { auditTag: { not: "resolved" }, status: { in: ["open", "in_progress", "reopened", "fixed"] } }
      : f.status === "resolved"
        ? { auditTag: "resolved" }
        : f.status === "ignored"
          ? { status: "ignored" }
          : {};
  const search: Prisma.IssueItemWhereInput = f.q
    ? {
        OR: [
          { url: { contains: f.q, mode: "insensitive" } },
          { ruleId: { contains: f.q, mode: "insensitive" } },
          { issue: { title: { contains: f.q, mode: "insensitive" } } },
        ],
      }
    : {};
  const severity: Prisma.IssueItemWhereInput = f.severity === "all" ? {} : { issue: { severity: f.severity } };
  return { projectId, ...status, ...search, ...severity };
}
