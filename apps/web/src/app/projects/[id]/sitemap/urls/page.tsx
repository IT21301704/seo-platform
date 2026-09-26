import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button, Card, CardLabel, EmptyState, Mono, Table, Td, Th } from "@/components/ui";
import { ManualUrlList } from "@/components/url-list-client";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { cn, formatDate, formatNumber, hostOf, pathOf } from "@/lib/utils";
import { runSitemapCheckAction, toggleAdded } from "../actions";

const ROWS = 200;
const outline =
  "inline-flex h-10 items-center rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold text-ink no-underline hover:bg-canvas hover:text-ink";

export default async function SitemapUrlListsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const tab = (await searchParams).tab === "remove" ? "remove" : "manual";
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const editable = canEdit(user.role);
  const check = await db.sitemapCheck.findFirst({
    where: { projectId: project.id, status: "completed" },
    orderBy: { createdAt: "desc" },
  });
  const running = await db.sitemapCheck.findFirst({
    where: { projectId: project.id, status: { in: ["queued", "running"] } },
  });
  const recheck = runSitemapCheckAction.bind(null, project.id, "urls");
  const toggle = toggleAdded.bind(null, project.id);
  const base = `/projects/${project.id}/sitemap/urls`;

  if (!check) {
    return (
      <>
        <PageHeader eyebrow={hostOf(project.rootUrl)} title="Sitemap URL lists" />
        <PageBody>
          <EmptyState title="Run a sitemap check first">
            <Link href={`/projects/${project.id}/sitemap`}>Open Sitemap check</Link>
          </EmptyState>
        </PageBody>
      </>
    );
  }

  const listType = tab === "manual" ? ("manual_add" as const) : ("remove" as const);
  const rows = await db.sitemapUrl.findMany({
    where: { checkId: check.id, listType },
    orderBy: { url: "asc" },
    take: ROWS,
  });
  const total = tab === "manual" ? check.manualUrls : check.urlsToRemove;
  const api = `/v1/sitemap-checks/${check.id}`;
  const listApi = tab === "manual" ? `${api}/manual-urls` : `${api}/remove-urls`;

  return (
    <>
      <AutoRefresh active={Boolean(running)} />
      <PageHeader
        eyebrow={
          <>
            <Link href={`/projects/${project.id}/sitemap`}>Sitemap check {check.id}</Link> ·{" "}
            {formatDate(check.createdAt)}
          </>
        }
        title="Sitemap URL lists"
        actions={
          <>
            <a className={outline} href={`${listApi}?format=csv`}>
              Download CSV
            </a>
            <a className={outline} href={`${listApi}?format=json`}>
              Download JSON
            </a>
            {tab === "manual" && (
              <a
                className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white no-underline hover:bg-primary-dark hover:text-white"
                href={`${listApi}?format=xml`}
              >
                Download XML
              </a>
            )}
          </>
        }
      />
      <PageBody>
        <nav aria-label="Lists" className="flex gap-2 border-b border-line">
          {[
            { key: "manual", label: `Add manually (${formatNumber(check.manualUrls)})` },
            { key: "remove", label: `Remove from sitemap (${formatNumber(check.urlsToRemove)})` },
          ].map((t) => (
            <Link
              key={t.key}
              href={t.key === "manual" ? base : `${base}?tab=remove`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-4 py-3 text-sm font-semibold no-underline",
                tab === t.key
                  ? "border-primary text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {tab === "manual" ? (
          <p className="m-0 rounded-[10px] border border-line bg-white p-4 text-sm text-muted">
            Only URLs that return 200, are self-canonical, have no noindex, are not blocked by
            robots.txt, are missing from every sitemap,{" "}
            <strong className="text-ink">and can&apos;t be added automatically</strong>.
          </p>
        ) : (
          <p className="m-0 rounded-[10px] border border-line bg-white p-4 text-sm text-muted">
            URLs listed in a sitemap that should not be: errors, redirects, noindex, blocked by
            robots.txt, non-canonical, or not https on this host. Kept separate from the add list.
          </p>
        )}

        {rows.length === 0 ? (
          <EmptyState title={tab === "manual" ? "Nothing to add by hand" : "Nothing to remove"} />
        ) : tab === "manual" ? (
          <ManualUrlList
            rows={rows.map((r) => ({
              id: r.id,
              url: r.url,
              path: pathOf(r.url),
              reason: r.reason,
              foundVia: r.foundVia,
              lastmod: r.suggestedLastmod,
              targetFile: r.targetFile,
              sitemapFile: r.sitemapFile,
              status: r.status,
              added: r.added,
            }))}
            editable={editable}
            onToggle={toggle}
          />
        ) : (
          <Card className="overflow-x-auto px-2 pb-2">
            <Table>
              <thead>
                <tr>
                  <Th>URL</Th>
                  <Th>Why remove it</Th>
                  <Th>Sitemap file</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <Mono>{pathOf(r.url)}</Mono>
                    </Td>
                    <Td>{r.reason}</Td>
                    <Td>
                      <Mono>{r.sitemapFile ? pathOf(r.sitemapFile) : "—"}</Mono>
                    </Td>
                    <Td>
                      <Mono>{r.status ?? "—"}</Mono>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
        {total > rows.length && (
          <p className="m-0 text-sm text-muted">
            Showing {rows.length} of {formatNumber(total)} URLs. Download the CSV or JSON for the
            full list.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="flex flex-col gap-3 p-5">
            <CardLabel>Same list by API</CardLabel>
            <code className="block rounded-lg bg-canvas p-3 font-mono text-[13px]">
              GET {api}/manual-urls?format=csv
            </code>
            <code className="block rounded-lg bg-canvas p-3 font-mono text-[13px]">
              GET {api}/remove-urls
            </code>
            <Link href={`/projects/${project.id}/api`} className="text-sm font-semibold">
              API keys and webhooks →
            </Link>
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <CardLabel>After adding them</CardLabel>
            <p className="m-0 text-sm text-muted">
              Run the check again. Added URLs leave this list. Resubmitting the sitemap to Search
              Console arrives with auto-fix (Phase 3).
            </p>
            {editable && (
              <form action={recheck}>
                <Button type="submit" className="w-full" disabled={Boolean(running)}>
                  {running ? "Check running…" : "Re-check sitemap"}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
