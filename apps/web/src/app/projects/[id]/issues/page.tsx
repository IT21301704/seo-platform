import Link from "next/link";
import { RULES_BY_ID, fixType } from "@seo/rules";
import { SEVERITIES } from "@seo/shared";
import { BulkForm } from "@/components/bulk-form";
import { PageBody, PageHeader } from "@/components/page-header";
import { Bar, Card, EmptyState, Mono, Pill, SeverityPill, Table, Td, Th } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { FIX_LABEL, SEVERITY_LABEL, STATUS_LABEL, TAG_LABEL } from "@/lib/labels";
import { itemTagCounts, latestCompletedCrawl } from "@/lib/queries";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { cn, formatDate, formatNumber, formatShortDate, hostOf, pathOf } from "@/lib/utils";
import { bulkUpdate } from "./actions";
import { itemWhere, parseFilters, toQuery } from "./filters";
import type { IssueFilters } from "./filters";

const TAG_TONE: Record<keyof typeof TAG_LABEL, Tone> = {
  new: "crit",
  still_open: "gray",
  regressed: "high",
  resolved: "pass",
};
const FIX_TONE = {
  "auto-low": "pass",
  "auto-approve": "high",
  manual: "gray",
  guide: "gray",
} as const;
const control = "h-10 rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm";
const ITEMS_PER_GROUP = 5;

export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const filters = parseFilters(await searchParams);
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const latest = await latestCompletedCrawl(db, project.id);
  const tags = await itemTagCounts(db, project.id);
  const users = (await db.user.findMany({ orderBy: { email: "asc" } })).map((u) => ({
    id: u.id,
    name: u.name ?? u.email,
  }));
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const base = `/projects/${project.id}/issues`;
  const where = itemWhere(project.id, filters);
  const exportHref = `${base}/export${toQuery(filters)}`;

  const header = (
    <PageHeader
      eyebrow={
        latest
          ? `${hostOf(project.rootUrl)} · ${formatNumber(tags.total)} issue items · audit of ${formatDate(latest.crawl.createdAt)}`
          : hostOf(project.rootUrl)
      }
      title="Issue manager"
    />
  );
  if (!latest) {
    return (
      <>
        {header}
        <PageBody>
          <EmptyState title="No issues yet">
            <p className="m-0 text-muted">Issues appear after the first audit completes.</p>
          </EmptyState>
        </PageBody>
      </>
    );
  }

  return (
    <>
      {header}
      <PageBody>
        <Card className="flex flex-wrap items-center gap-4 px-5 py-4">
          <span className="text-[15px] font-semibold">
            {formatNumber(tags.resolved)} of {formatNumber(tags.total)} resolved
          </span>
          <Bar
            value={tags.total ? (tags.resolved / tags.total) * 100 : 0}
            tone="pass"
            className="min-w-40 flex-1"
          />
          <Pill tone="crit">{tags.new} new</Pill>
          <Pill tone="gray">{tags.still_open} still open</Pill>
          <Pill tone="high">{tags.regressed} regressed</Pill>
          <Pill tone="pass">{tags.resolved} resolved</Pill>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Views" className="flex rounded-[10px] bg-[#E9E9E4] p-1">
            {(["grouped", "flat"] as const).map((v) => (
              <Link
                key={v}
                href={`${base}${toQuery(filters, { view: v })}`}
                aria-current={filters.view === v ? "page" : undefined}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-semibold no-underline",
                  filters.view === v ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {v === "grouped" ? "Grouped" : "Flat list"}
              </Link>
            ))}
            {["By page", "Board", "By source"].map((v) => (
              <span
                key={v}
                className="cursor-not-allowed px-4 py-2 text-sm font-semibold text-[#9A9DA2]"
                title="Available in Phase 2"
              >
                {v}
              </span>
            ))}
          </nav>
        </div>

        <form method="get" action={base} className="flex flex-wrap gap-3" role="search">
          {filters.view !== "grouped" && <input type="hidden" name="view" value={filters.view} />}
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={filters.q}
            placeholder="Search rule, page or folder, e.g. /products"
            className={`${control} min-w-64 flex-1`}
          />
          <label className="sr-only" htmlFor="severity">
            Severity
          </label>
          <select id="severity" name="severity" defaultValue={filters.severity} className={control}>
            <option value="all">Severity: All</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                Severity: {SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={filters.status} className={control}>
            <option value="open">Status: Open</option>
            <option value="resolved">Status: Resolved</option>
            <option value="ignored">Status: Ignored</option>
            <option value="all">Status: All</option>
          </select>
          <button
            type="submit"
            className="h-10 rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold"
          >
            Apply
          </button>
        </form>

        <BulkForm
          action={bulkUpdate.bind(null, project.id)}
          users={users}
          exportHref={exportHref}
          editable={canEdit(user.role)}
        >
          {filters.view === "grouped" ? (
            <GroupedView
              projectId={project.id}
              filters={filters}
              where={where}
              db={db}
              userName={userName}
              base={base}
            />
          ) : (
            <FlatView
              projectId={project.id}
              filters={filters}
              where={where}
              db={db}
              userName={userName}
              base={base}
            />
          )}
        </BulkForm>
      </PageBody>
    </>
  );
}

type Db = Awaited<ReturnType<typeof requireUser>>["db"];
interface ViewProps {
  projectId: string;
  filters: IssueFilters;
  where: ReturnType<typeof itemWhere>;
  db: Db;
  userName: Map<string, string>;
  base: string;
}

async function GroupedView({ projectId, filters, where, db, userName, base }: ViewProps) {
  const grouped = await db.issueItem.groupBy({ by: ["issueId"], where, _count: { _all: true } });
  const matchCount = new Map(grouped.map((g) => [g.issueId, g._count._all]));
  const issues = await db.issue.findMany({
    where: { projectId, id: { in: [...matchCount.keys()] } },
    orderBy: [{ priority: "desc" }, { ruleId: "asc" }],
    take: filters.limit,
  });
  const items = await db.issueItem.findMany({
    where: { ...where, issueId: { in: issues.map((i) => i.id) } },
    orderBy: [{ auditTag: "asc" }, { url: "asc" }],
  });
  const byIssue = new Map<string, typeof items>();
  for (const item of items) byIssue.set(item.issueId, [...(byIssue.get(item.issueId) ?? []), item]);

  if (issues.length === 0) return <EmptyState title="Nothing matches these filters" />;
  return (
    <Card className="overflow-x-auto px-2 pb-2">
      <Table>
        <thead>
          <tr>
            <Th className="w-10">
              <span className="sr-only">Select</span>
            </Th>
            <Th>Issue type</Th>
            <Th>Source</Th>
            <Th>Severity</Th>
            <Th>Open / total</Th>
            <Th>Assignee</Th>
            <Th>Fix</Th>
          </tr>
        </thead>
        {issues.map((issue) => {
          const rule = RULES_BY_ID.get(issue.ruleId);
          const fix = rule ? fixType(rule) : "guide";
          const rows = byIssue.get(issue.id) ?? [];
          const assignees = [...new Set(rows.map((r) => r.assigneeId))];
          const assignee =
            assignees.length === 1
              ? assignees[0]
                ? (userName.get(assignees[0]) ?? "—")
                : "Unassigned"
              : "Several";
          return (
            <tbody key={issue.id} className="group">
              <tr>
                <Td>
                  <input
                    type="checkbox"
                    name="selection"
                    value={`issue:${issue.id}`}
                    aria-label={`Select all open items of ${issue.title}`}
                    className="h-4 w-4"
                  />
                </Td>
                <Td>
                  <details className="[&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer list-none items-start gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 text-muted group-has-[details[open]]:rotate-90"
                      >
                        ▸
                      </span>
                      <span>
                        <Link href={`${base}/${issue.ruleId}`} className="font-semibold">
                          {issue.title}
                        </Link>
                        <Mono className="block text-xs text-muted">{issue.ruleId}</Mono>
                      </span>
                    </summary>
                    <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0 pl-5">
                      {rows.slice(0, ITEMS_PER_GROUP).map((item) => (
                        <li key={item.id} className="flex flex-wrap items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            name="selection"
                            value={`item:${item.id}`}
                            aria-label={`Select ${pathOf(item.url)}`}
                            className="h-4 w-4"
                          />
                          <Mono className="min-w-48 flex-1">{pathOf(item.url)}</Mono>
                          <Pill tone={TAG_TONE[item.auditTag]}>{TAG_LABEL[item.auditTag]}</Pill>
                          <span className="w-24">{STATUS_LABEL[item.status]}</span>
                          <span className="w-28 text-muted">
                            {item.assigneeId ? userName.get(item.assigneeId) : "Unassigned"}
                          </span>
                          <span className="text-muted">
                            since {formatShortDate(item.firstSeen)}
                          </span>
                        </li>
                      ))}
                      {rows.length > ITEMS_PER_GROUP && (
                        <li>
                          <Link href={`${base}/${issue.ruleId}`} className="text-sm font-semibold">
                            Show all {rows.length} pages
                          </Link>
                        </li>
                      )}
                    </ul>
                  </details>
                </Td>
                <Td>Site audit</Td>
                <Td>
                  <SeverityPill severity={issue.severity} />
                </Td>
                <Td>
                  <Mono>
                    {issue.openCount} / {issue.totalCount}
                  </Mono>
                </Td>
                <Td>{assignee}</Td>
                <Td>
                  <Pill tone={FIX_TONE[fix]}>{FIX_LABEL[fix]}</Pill>
                </Td>
              </tr>
            </tbody>
          );
        })}
      </Table>
      <div className="flex items-center justify-between px-3 pt-3 text-sm text-muted">
        <span>
          Showing {issues.length} of {matchCount.size} issue types · sorted by priority
        </span>
        {matchCount.size > issues.length && (
          <Link
            href={`${base}${toQuery(filters, { limit: filters.limit + 20 })}`}
            className="font-semibold"
          >
            Load more
          </Link>
        )}
      </div>
    </Card>
  );
}

async function FlatView({ filters, where, db, userName, base }: ViewProps) {
  const [total, items] = await Promise.all([
    db.issueItem.count({ where }),
    db.issueItem.findMany({
      where,
      include: { issue: { select: { title: true, severity: true, priority: true } } },
      orderBy: [{ issue: { priority: "desc" } }, { ruleId: "asc" }, { url: "asc" }],
      take: filters.limit * 5,
    }),
  ]);
  if (items.length === 0) return <EmptyState title="Nothing matches these filters" />;
  return (
    <Card className="overflow-x-auto px-2 pb-2">
      <Table>
        <thead>
          <tr>
            <Th className="w-10">
              <span className="sr-only">Select</span>
            </Th>
            <Th>Page</Th>
            <Th>Issue</Th>
            <Th>Severity</Th>
            <Th>Tag</Th>
            <Th>Status</Th>
            <Th>Owner</Th>
            <Th>Since</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <Td>
                <input
                  type="checkbox"
                  name="selection"
                  value={`item:${item.id}`}
                  aria-label={`Select ${pathOf(item.url)}`}
                  className="h-4 w-4"
                />
              </Td>
              <Td>
                <Mono>{pathOf(item.url)}</Mono>
              </Td>
              <Td>
                <Link href={`${base}/${item.ruleId}`} className="font-semibold">
                  {item.issue.title}
                </Link>
                <Mono className="block text-xs text-muted">{item.ruleId}</Mono>
              </Td>
              <Td>
                <SeverityPill severity={item.issue.severity} />
              </Td>
              <Td>
                <Pill tone={TAG_TONE[item.auditTag]}>{TAG_LABEL[item.auditTag]}</Pill>
              </Td>
              <Td>{STATUS_LABEL[item.status]}</Td>
              <Td className="text-muted">
                {item.assigneeId ? userName.get(item.assigneeId) : "Unassigned"}
              </Td>
              <Td className="text-muted">{formatShortDate(item.firstSeen)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="flex items-center justify-between px-3 pt-3 text-sm text-muted">
        <span>
          Showing {items.length} of {total} items · sorted by priority
        </span>
        {total > items.length && (
          <Link
            href={`${base}${toQuery(filters, { limit: filters.limit + 20 })}`}
            className="font-semibold"
          >
            Load more
          </Link>
        )}
      </div>
    </Card>
  );
}
