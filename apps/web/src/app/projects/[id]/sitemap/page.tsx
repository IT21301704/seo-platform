import Link from "next/link";
import type { RuleReport } from "@seo/scoring";
import { URL_INSPECTION_DAILY_LIMIT } from "@seo/integrations";
import { inspectionQuota } from "@seo/worker/google-sync";
import { AutoRefresh } from "@/components/auto-refresh";
import { GoogleConnections } from "@/components/google-connections";
import { PageBody, PageHeader } from "@/components/page-header";
import { Bar, Button, Card, CardLabel, EmptyState, Mono, Pill, Table, Td, Th } from "@/components/ui";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { smpLabel, smpStatus } from "@/lib/sitemap";
import { formatDate, formatDateTime, formatNumber, formatShortDate, hostOf, pathOf } from "@/lib/utils";
import { runSitemapCheckAction } from "./actions";

const GSC_STATES = [
  "Submitted and indexed",
  "Crawled - currently not indexed",
  "Discovered - currently not indexed",
  "Excluded by 'noindex' tag",
  "Page with redirect",
];

export default async function SitemapCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const editable = canEdit(user.role);
  const [latest, running, integrations] = await Promise.all([
    db.sitemapCheck.findFirst({ where: { projectId: project.id, status: "completed" }, orderBy: { createdAt: "desc" }, include: { files: { orderBy: { url: "asc" } } } }),
    db.sitemapCheck.findFirst({ where: { projectId: project.id, status: { in: ["queued", "running"] } }, orderBy: { createdAt: "desc" } }),
    db.integration.findMany({ where: { projectId: project.id } }),
  ]);
  const failed = await db.sitemapCheck.findFirst({ where: { projectId: project.id, status: "failed", createdAt: { gt: latest?.createdAt ?? new Date(0) } }, orderBy: { createdAt: "desc" } });
  const run = runSitemapCheckAction.bind(null, project.id, "sitemap");
  const rules = ((latest?.results ?? []) as unknown as RuleReport[]).slice().sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const fixable = rules.filter((r) => r.status === "fail" && r.autoFixable).length;
  const applicable = rules.filter((r) => r.status !== "na");
  const indexFiles = latest?.files.filter((f) => f.kind === "sitemapindex").length ?? 0;
  const gsc = latest?.gsc as { inspected: number; indexed: number; notIndexed: number; fetchedAt: string } | null;
  const states = latest
    ? await db.sitemapUrl.groupBy({ by: ["gscState"], where: { checkId: latest.id, inSitemap: true, gscState: { not: null } }, _count: { _all: true } })
    : [];
  const stateCount = new Map(states.map((s) => [s.gscState ?? "", s._count._all]));
  const otherStates = states.filter((s) => !GSC_STATES.includes(s.gscState ?? ""));
  const quota = await inspectionQuota(db, project.id, new Date());
  const half = Math.ceil(rules.length / 2);

  const header = (
    <PageHeader
      eyebrow={
        latest ? (
          <>
            API check <Mono>{latest.id}</Mono> · {formatDateTime(latest.createdAt)} · ruleset v{latest.rulesetVersion}
          </>
        ) : (
          hostOf(project.rootUrl)
        )
      }
      title="Sitemap check"
      actions={
        <>
          {latest && (
            <a href={`/v1/sitemap-checks/${latest.id}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold text-ink no-underline hover:bg-canvas hover:text-ink">
              View API response
            </a>
          )}
          {editable && (
            <form action={run}>
              <Button type="submit" variant="secondary" disabled={Boolean(running)}>
                {running ? "Check running…" : "Run check"}
              </Button>
            </form>
          )}
          <Button type="button" disabled title="Sitemap auto-fix arrives in Phase 3">
            Fix {fixable} {fixable === 1 ? "issue" : "issues"} automatically
          </Button>
        </>
      }
    />
  );

  return (
    <>
      <AutoRefresh active={Boolean(running)} />
      {header}
      <PageBody>
        {running && <p className="m-0 rounded-lg bg-primary-soft p-3 text-sm text-primary">A sitemap check is running. This page updates when it finishes.</p>}
        {failed && <p className="m-0 rounded-lg bg-crit-bg p-3 text-sm text-crit">The last check failed: {failed.error}</p>}
        {!latest ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
            <EmptyState title="No sitemap check yet">
              <p className="m-0 text-muted">Run a check to validate your sitemaps, every listed URL, and (with Search Console) Google&apos;s index status.</p>
            </EmptyState>
            <GoogleConnections projectId={project.id} integrations={integrations} editable={editable} back="sitemap" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
              <Card className="flex flex-col gap-1 p-4">
                <span className="text-sm text-muted">Sitemap score</span>
                <span className="text-[30px] font-bold leading-tight">{latest.score ?? "—"}</span>
                <span className="text-xs text-muted">
                  {applicable.filter((r) => r.status === "pass").length} of {applicable.length} applicable checks pass
                </span>
              </Card>
              <Card className="flex flex-col gap-1 p-4">
                <span className="text-sm text-muted">URLs in sitemaps</span>
                <span className="text-[30px] font-bold leading-tight">{formatNumber(latest.urlsInSitemaps)}</span>
                <span className="text-xs text-muted">
                  {latest.sitemapsCount - indexFiles} {latest.sitemapsCount - indexFiles === 1 ? "file" : "files"}
                  {indexFiles ? ` + ${indexFiles} index` : ""}
                </span>
              </Card>
              <Card className="flex flex-col gap-1 p-4">
                <span className="text-sm text-muted">Indexed in Google</span>
                <span className="text-[30px] font-bold leading-tight">{gsc ? formatNumber(gsc.indexed) : "—"}</span>
                <span className="text-xs text-muted">{gsc ? `of ${formatNumber(gsc.inspected)} inspected` : "Connect Search Console"}</span>
              </Card>
              <Card className="flex flex-col gap-1 p-4">
                <span className="text-sm text-muted">Add manually</span>
                <span className="text-[30px] font-bold leading-tight">{formatNumber(latest.manualUrls)}</span>
                <Link href={`/projects/${project.id}/sitemap/urls`} className="text-[13px] font-semibold">
                  Open URL list →
                </Link>
              </Card>
              <Card className="flex flex-col gap-1 p-4">
                <span className="text-sm text-muted">Remove from sitemap</span>
                <span className="text-[30px] font-bold leading-tight">{formatNumber(latest.urlsToRemove)}</span>
                <Link href={`/projects/${project.id}/sitemap/urls?tab=remove`} className="text-[13px] font-semibold">
                  Open URL list →
                </Link>
              </Card>
            </div>

            <div className="flex flex-col gap-5 xl:flex-row">
              <Card className="min-w-0 flex-1 p-5">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <CardLabel>Google sitemap checks</CardLabel>
                  <span className="text-xs text-muted">priority and changefreq are ignored by Google</span>
                </div>
                <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
                  {[rules.slice(0, half), rules.slice(half)].map((col, c) => (
                    <ul key={c} className="m-0 list-none p-0">
                      {col.map((r) => {
                        const s = smpStatus(r, latest.manualUrls);
                        return (
                          <li key={r.ruleId} className="flex items-center gap-3 border-b border-[#EDEDE8] py-2.5 text-sm">
                            <Mono className="w-[72px] shrink-0 text-muted">{r.ruleId}</Mono>
                            <Link href={`/projects/${project.id}/issues/${r.ruleId}`} className="flex-1 text-ink no-underline hover:text-primary">
                              {smpLabel(r)}
                            </Link>
                            <Pill tone={s.tone}>{s.text}</Pill>
                          </li>
                        );
                      })}
                    </ul>
                  ))}
                </div>
              </Card>

              <div className="flex flex-col gap-5 xl:w-[350px] xl:shrink-0">
                <Card className="flex flex-col gap-3 p-5">
                  <CardLabel>Google index status (URL Inspection)</CardLabel>
                  {!gsc ? (
                    <p className="m-0 text-sm text-muted">Connect Search Console to see which sitemap URLs Google has indexed.</p>
                  ) : (
                    <>
                      {[...GSC_STATES, ...otherStates.map((s) => s.gscState ?? "")].map((state) => {
                        const n = stateCount.get(state) ?? 0;
                        const indexedState = state === "Submitted and indexed";
                        return (
                          <div key={state} className="flex flex-col gap-1 text-sm">
                            <div className="flex justify-between">
                              <span>{state.replace(" - ", " – ")}</span>
                              <Mono>{formatNumber(n)}</Mono>
                            </div>
                            <Bar value={gsc.inspected ? (n / gsc.inspected) * 100 : 0} tone={indexedState ? "pass" : "primary"} />
                          </div>
                        );
                      })}
                      <p className="m-0 text-xs text-muted">
                        Inspected {formatNumber(gsc.inspected)} of {formatNumber(latest.urlsInSitemaps)} · limit {formatNumber(URL_INSPECTION_DAILY_LIMIT)} per day ({formatNumber(quota.used)} used today) · data from {formatDate(gsc.fetchedAt)}. URLs not
                        inspected yet are not estimated.
                      </p>
                    </>
                  )}
                </Card>
                <Card className="px-2 pb-2 pt-4">
                  <CardLabel className="px-3">Sitemap files</CardLabel>
                  <Table>
                    <thead>
                      <tr>
                        <Th>File</Th>
                        <Th>URLs</Th>
                        <Th>GSC read</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {latest.files.map((f) => (
                        <tr key={f.id}>
                          <Td>
                            <Mono title={`${f.generator} · found via ${f.discoveredVia}`}>{pathOf(f.url)}</Mono>
                            <div className="text-xs text-muted">{f.generator}</div>
                          </Td>
                          <Td>{f.kind === "sitemapindex" ? "Index" : f.status === 200 ? formatNumber(f.urlCount) : <Pill tone="crit">{f.status ?? "error"}</Pill>}</Td>
                          <Td>{f.gscLastDownloaded ? formatShortDate(f.gscLastDownloaded) : "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
                <GoogleConnections projectId={project.id} integrations={integrations} editable={editable} back="sitemap" />
                <Link href={`/projects/${project.id}/api`} className="text-sm font-semibold">
                  API keys and webhooks →
                </Link>
              </div>
            </div>
          </>
        )}
        <p className="m-0 flex gap-2 rounded-[10px] border border-[#C9D3F5] bg-primary-soft p-4 text-sm">
          Sitemap and robots.txt fixes are high risk, so each one will need your approval (auto-fix arrives in Phase 3). After publishing, we re-check and resubmit
          the sitemap. Google decides what to index, so resubmitting can&apos;t guarantee indexing.
        </p>
      </PageBody>
    </>
  );
}
