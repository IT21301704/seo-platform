import Link from "next/link";
import { RULES_BY_ID, fixType } from "@seo/rules";
import { SEVERITIES } from "@seo/shared";
import { BulkForm } from "@/components/bulk-form";
import { PageBody, PageHeader } from "@/components/page-header";
import { Bar, Card, EmptyState, Mono, Pill, SeverityPill, Table, Td, Th } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { CATEGORY_LABEL, FIX_LABEL, SEVERITY_LABEL, STATUS_LABEL, TAG_LABEL } from "@/lib/labels";
import { itemTagCounts, latestCompletedCrawl } from "@/lib/queries";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { cn, formatDate, formatNumber, formatShortDate, hostOf, pathOf } from "@/lib/utils";
import { bulkUpdate, deleteView, saveView } from "./actions";
import {
  CATEGORIES,
  FIX_TYPES,
  SORTS,
  SOURCES,
  itemOrder,
  itemWhere,
  parseFilters,
  toQuery,
} from "./filters";
import type { IssueFilters, View } from "./filters";

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
const SOURCE_LABEL: Record<string, string> = {
  site_audit: "Site audit",
  sitemap_api: "Sitemap API",
  keywords: "Keywords",
  monitoring: "Monitoring",
};
const VIEW_LABEL: Record<View, string> = {
  grouped: "Grouped",
  flat: "Flat list",
  page: "By page",
  board: "Board",
  source: "By source",
};
const BOARD_COLUMNS = ["open", "in_progress", "fixed", "reopened", "verified", "ignored"] as const;
const control = "h-10 rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm";
const ITEMS_PER_GROUP = 5;

type Db = Awaited<ReturnType<typeof requireUser>>["db"];
interface ViewProps {
  projectId: string;
  filters: IssueFilters;
  where: ReturnType<typeof itemWhere>;
  db: Db;
  userName: Map<string, string>;
  base: string;
}

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
  const [tags, users, views] = await Promise.all([
    itemTagCounts(db, project.id),
    db.user.findMany({ orderBy: { email: "asc" } }),
    db.savedView.findMany({
      where: { projectId: project.id, userId: user.id },
      orderBy: { name: "asc" },
    }),
  ]);
  const people = users.map((u) => ({ id: u.id, name: u.name ?? u.email }));
  const userName = new Map(people.map((u) => [u.id, u.name]));
  const base = `/projects/${project.id}/issues`;
  const where = itemWhere(project.id, filters, user.id);
  const query = toQuery(filters);

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
  if (tags.total === 0) {
    return (
      <>
        {header}
        <PageBody>
          <EmptyState title="No issues yet">
            <p className="m-0 text-muted">
              Issues appear after an audit or a sitemap check finds something.
            </p>
          </EmptyState>
        </PageBody>
      </>
    );
  }

  const props: ViewProps = { projectId: project.id, filters, where, db, userName, base };
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
          <Link
            href={`${base}${toQuery(filters, { onlyNew: true, status: "all" })}`}
            className="no-underline"
          >
            <Pill tone="crit">{tags.new} new</Pill>
          </Link>
          <Pill tone="gray">{tags.still_open} still open</Pill>
          <Pill tone="high">{tags.regressed} regressed</Pill>
          <Pill tone="pass">{tags.resolved} resolved</Pill>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Views" className="flex flex-wrap rounded-[10px] bg-[#E9E9E4] p-1">
            {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
              <Link
                key={v}
                href={`${base}${toQuery(filters, { view: v })}`}
                aria-current={filters.view === v ? "page" : undefined}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-semibold no-underline",
                  filters.view === v ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {VIEW_LABEL[v]}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <details className="relative">
              <summary className={cn(control, "flex cursor-pointer list-none items-center")}>
                Saved view:{" "}
                {views.find((v) => v.query === query)?.name ?? (query ? "Custom" : "All open")}
              </summary>
              <div className="absolute right-0 z-10 mt-1 flex w-72 flex-col gap-1 rounded-lg border border-line bg-white p-2 shadow-lg">
                <Link
                  href={base}
                  className="rounded px-2 py-1.5 text-sm no-underline hover:bg-canvas"
                >
                  All open
                </Link>
                {views.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-canvas"
                  >
                    <Link href={`${base}${v.query}`} className="text-sm no-underline">
                      {v.name}
                    </Link>
                    <form action={deleteView.bind(null, project.id, v.id)}>
                      <button
                        type="submit"
                        className="text-xs text-muted"
                        aria-label={`Delete saved view ${v.name}`}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                ))}
                <form
                  action={saveView.bind(null, project.id, query)}
                  className="mt-1 flex gap-1 border-t border-line pt-2"
                >
                  <input
                    name="name"
                    required
                    placeholder="Name this view"
                    aria-label="Saved view name"
                    className="h-8 flex-1 rounded border border-[#CFCFC8] px-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="h-8 rounded bg-primary px-2 text-xs font-semibold text-white"
                  >
                    Save
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>

        <form method="get" action={base} className="flex flex-wrap gap-2" role="search">
          <input type="hidden" name="view" value={filters.view} />
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={filters.q}
            placeholder="Search rule, page or folder, e.g. /products"
            className={`${control} min-w-56 flex-1`}
          />
          <select
            name="severity"
            defaultValue={filters.severity}
            aria-label="Severity"
            className={control}
          >
            <option value="all">Severity: All</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                Severity: {SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            name="source"
            defaultValue={filters.source}
            aria-label="Source"
            className={control}
          >
            <option value="all">Source: All</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                Source: {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={filters.status}
            aria-label="Status"
            className={control}
          >
            <option value="open">Status: Open</option>
            <option value="resolved">Status: Resolved</option>
            <option value="ignored">Status: Ignored</option>
            <option value="all">Status: All</option>
          </select>
          <select
            name="assignee"
            defaultValue={filters.assignee}
            aria-label="Assignee"
            className={control}
          >
            <option value="all">Assignee: Anyone</option>
            <option value="me">Assignee: Me</option>
            <option value="none">Unassigned</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                Assignee: {u.name}
              </option>
            ))}
          </select>
          <select
            name="category"
            defaultValue={filters.category}
            aria-label="Category"
            className={control}
          >
            <option value="all">Category: All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <select name="fix" defaultValue={filters.fix} aria-label="Fix type" className={control}>
            <option value="all">Fix: All</option>
            {FIX_TYPES.map((f) => (
              <option key={f} value={f}>
                {FIX_LABEL[f]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm">
            First seen since
            <input type="date" name="since" defaultValue={filters.since} className={control} />
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              name="new"
              value="1"
              defaultChecked={filters.onlyNew}
              className="h-4 w-4"
            />{" "}
            New since last audit
          </label>
          <select name="sort" defaultValue={filters.sort} aria-label="Sort" className={control}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                Sort: {s === "url" ? "URL" : s[0]?.toUpperCase() + s.slice(1)}
              </option>
            ))}
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
          users={people}
          exportHref={`${base}/export${query}`}
          editable={canEdit(user.role)}
        >
          {filters.view === "flat" ? (
            <FlatView {...props} />
          ) : filters.view === "page" ? (
            <PageView {...props} />
          ) : filters.view === "board" ? (
            <BoardView {...props} />
          ) : filters.view === "source" ? (
            <SourceView {...props} />
          ) : (
            <GroupedView {...props} />
          )}
        </BulkForm>
      </PageBody>
    </>
  );
}

function ItemLine({
  item,
  userName,
}: {
  item: {
    id: string;
    url: string;
    auditTag: keyof typeof TAG_LABEL;
    status: keyof typeof STATUS_LABEL;
    assigneeId: string | null;
    firstSeen: Date;
    dueDate: Date | null;
  };
  userName: Map<string, string>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 text-sm">
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
        {item.dueDate
          ? `due ${formatShortDate(item.dueDate)}`
          : `since ${formatShortDate(item.firstSeen)}`}
      </span>
    </li>
  );
}

async function GroupedView({ projectId, filters, where, db, userName, base }: ViewProps) {
  const grouped = await db.issueItem.groupBy({ by: ["issueId"], where, _count: { _all: true } });
  const matchCount = new Map(grouped.map((g) => [g.issueId, g._count._all]));
  const issues = await db.issue.findMany({
    where: { projectId, id: { in: [...matchCount.keys()] } },
    orderBy:
      filters.sort === "severity"
        ? [{ severity: "asc" }, { ruleId: "asc" }]
        : [{ priority: "desc" }, { ruleId: "asc" }],
    take: filters.limit,
  });
  // A few items per issue type, fetched per type so huge types stay cheap.
  const itemsByIssue = new Map(
    await Promise.all(
      issues.map(
        async (i) =>
          [
            i.id,
            await db.issueItem.findMany({
              where: { ...where, issueId: i.id },
              orderBy: [{ auditTag: "asc" }, { url: "asc" }],
              take: ITEMS_PER_GROUP,
            }),
          ] as const,
      ),
    ),
  );
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
            <Th>Matching</Th>
            <Th>Fix</Th>
          </tr>
        </thead>
        {issues.map((issue) => {
          const rule = RULES_BY_ID.get(issue.ruleId);
          const fix = rule ? fixType(rule) : "guide";
          const rows = itemsByIssue.get(issue.id) ?? [];
          const matching = matchCount.get(issue.id) ?? 0;
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
                      {rows.map((item) => (
                        <ItemLine key={item.id} item={item} userName={userName} />
                      ))}
                      {matching > rows.length && (
                        <li>
                          <Link href={`${base}/${issue.ruleId}`} className="text-sm font-semibold">
                            Show all {formatNumber(matching)} pages
                          </Link>
                        </li>
                      )}
                    </ul>
                  </details>
                </Td>
                <Td>{SOURCE_LABEL[issue.source]}</Td>
                <Td>
                  <SeverityPill severity={issue.severity} />
                </Td>
                <Td>
                  <Mono>
                    {issue.openCount} / {issue.totalCount}
                  </Mono>
                </Td>
                <Td>
                  <Mono>{formatNumber(matching)}</Mono>
                </Td>
                <Td>
                  <Pill tone={FIX_TONE[fix]}>{FIX_LABEL[fix]}</Pill>
                </Td>
              </tr>
            </tbody>
          );
        })}
      </Table>
      <Footer
        shown={issues.length}
        total={matchCount.size}
        noun="issue types"
        filters={filters}
        base={base}
      />
    </Card>
  );
}

function Footer({
  shown,
  total,
  noun,
  filters,
  base,
}: {
  shown: number;
  total: number;
  noun: string;
  filters: IssueFilters;
  base: string;
}) {
  return (
    <div className="flex items-center justify-between px-3 pt-3 text-sm text-muted">
      <span>
        Showing {formatNumber(shown)} of {formatNumber(total)} {noun} · sorted by {filters.sort}
      </span>
      {total > shown && (
        <Link
          href={`${base}${toQuery(filters, { limit: filters.limit + 20 })}`}
          className="font-semibold"
        >
          Load more
        </Link>
      )}
    </div>
  );
}

async function FlatView({ filters, where, db, userName, base }: ViewProps) {
  const take = filters.limit * 5;
  const [total, items] = await Promise.all([
    db.issueItem.count({ where }),
    db.issueItem.findMany({
      where,
      include: { issue: { select: { title: true, severity: true } } },
      orderBy: itemOrder(filters.sort),
      take,
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
            <Th>Due</Th>
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
              <Td className="text-muted">{item.dueDate ? formatShortDate(item.dueDate) : "—"}</Td>
              <Td className="text-muted">{formatShortDate(item.firstSeen)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Footer shown={items.length} total={total} noun="items" filters={filters} base={base} />
    </Card>
  );
}

async function PageView({ filters, where, db, userName, base }: ViewProps) {
  const groups = await db.issueItem.groupBy({
    by: ["url"],
    where,
    _count: { _all: true },
    orderBy: [{ _count: { url: "desc" } }, { url: "asc" }],
    take: filters.limit,
  });
  const totalPages = (await db.issueItem.groupBy({ by: ["url"], where })).length;
  const items = await db.issueItem.findMany({
    where: { ...where, url: { in: groups.map((g) => g.url) } },
    include: { issue: { select: { title: true, severity: true } } },
    orderBy: [{ ruleId: "asc" }],
  });
  if (groups.length === 0) return <EmptyState title="Nothing matches these filters" />;
  return (
    <Card className="flex flex-col gap-1 p-2">
      {groups.map((g) => (
        <details
          key={g.url}
          className="rounded-lg px-3 py-2 hover:bg-canvas [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <Mono>{pathOf(g.url)}</Mono>
            <Pill tone="gray">{g._count._all} items</Pill>
          </summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0 pl-4">
            {items
              .filter((i) => i.url === g.url)
              .map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="selection"
                    value={`item:${i.id}`}
                    aria-label={`Select ${i.ruleId} on ${pathOf(i.url)}`}
                    className="h-4 w-4"
                  />
                  <SeverityPill severity={i.issue.severity} />
                  <Link href={`${base}/${i.ruleId}`} className="flex-1">
                    {i.issue.title} <Mono className="text-xs text-muted">{i.ruleId}</Mono>
                  </Link>
                  <span className="w-24">{STATUS_LABEL[i.status]}</span>
                  <span className="text-muted">
                    {i.assigneeId ? userName.get(i.assigneeId) : "Unassigned"}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      ))}
      <Footer shown={groups.length} total={totalPages} noun="pages" filters={filters} base={base} />
    </Card>
  );
}

async function BoardView({ filters, where, db, userName, base }: ViewProps) {
  // The board shows every workflow state; the status filter does not hide columns.
  const boardWhere = {
    ...where,
    status: undefined,
    auditTag: filters.onlyNew ? ("new" as const) : undefined,
  };
  const columns = await Promise.all(
    BOARD_COLUMNS.map(async (status) => {
      const w = { ...boardWhere, status };
      const [count, items] = await Promise.all([
        db.issueItem.count({ where: w }),
        db.issueItem.findMany({
          where: w,
          include: { issue: { select: { title: true, severity: true } } },
          orderBy: itemOrder(filters.sort),
          take: 25,
        }),
      ]);
      return { status, count, items };
    }),
  );
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {columns.map((col) => (
        <section
          key={col.status}
          className="flex min-w-0 flex-col gap-2 rounded-[10px] bg-[#E9E9E4] p-2"
          aria-label={STATUS_LABEL[col.status]}
        >
          <h2 className="m-0 flex items-center justify-between px-1 text-sm font-semibold">
            {STATUS_LABEL[col.status]} <Mono className="text-muted">{formatNumber(col.count)}</Mono>
          </h2>
          {col.items.map((i) => (
            <article
              key={i.id}
              className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-2.5 text-sm"
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="selection"
                  value={`item:${i.id}`}
                  aria-label={`Select ${i.ruleId} on ${pathOf(i.url)}`}
                  className="mt-0.5 h-4 w-4"
                />
                <Link href={`${base}/${i.ruleId}`} className="font-semibold leading-snug">
                  {i.issue.title}
                </Link>
              </div>
              <Mono className="truncate text-xs text-muted">{pathOf(i.url)}</Mono>
              <div className="flex flex-wrap items-center gap-1.5">
                <SeverityPill severity={i.issue.severity} />
                <span className="text-xs text-muted">
                  {i.assigneeId ? userName.get(i.assigneeId) : "Unassigned"}
                </span>
              </div>
            </article>
          ))}
          {col.count > col.items.length && (
            <span className="px-1 text-xs text-muted">
              +{formatNumber(col.count - col.items.length)} more
            </span>
          )}
        </section>
      ))}
    </div>
  );
}

async function SourceView({ projectId, where, db, base }: ViewProps) {
  const grouped = await db.issueItem.groupBy({ by: ["issueId"], where, _count: { _all: true } });
  const count = new Map(grouped.map((g) => [g.issueId, g._count._all]));
  const issues = await db.issue.findMany({
    where: { projectId, id: { in: [...count.keys()] } },
    orderBy: [{ priority: "desc" }, { ruleId: "asc" }],
  });
  if (issues.length === 0) return <EmptyState title="Nothing matches these filters" />;
  return (
    <div className="flex flex-col gap-4">
      {SOURCES.filter((s) => issues.some((i) => i.source === s)).map((source) => (
        <Card key={source} className="px-2 pb-2 pt-4">
          <h2 className="label-caps m-0 px-3">
            {SOURCE_LABEL[source]} ·{" "}
            {formatNumber(
              issues
                .filter((i) => i.source === source)
                .reduce((n, i) => n + (count.get(i.id) ?? 0), 0),
            )}{" "}
            items
          </h2>
          <Table>
            <tbody>
              {issues
                .filter((i) => i.source === source)
                .map((i) => (
                  <tr key={i.id}>
                    <Td className="w-10">
                      <input
                        type="checkbox"
                        name="selection"
                        value={`issue:${i.id}`}
                        aria-label={`Select all open items of ${i.title}`}
                        className="h-4 w-4"
                      />
                    </Td>
                    <Td>
                      <Link href={`${base}/${i.ruleId}`} className="font-semibold">
                        {i.title}
                      </Link>
                      <Mono className="block text-xs text-muted">{i.ruleId}</Mono>
                    </Td>
                    <Td>
                      <SeverityPill severity={i.severity} />
                    </Td>
                    <Td>
                      <Mono>{formatNumber(count.get(i.id) ?? 0)}</Mono>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
