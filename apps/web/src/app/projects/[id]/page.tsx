import Link from "next/link";
import { CATEGORY_WEIGHTS_V1 } from "@seo/shared";
import { PageBody, PageHeader } from "@/components/page-header";
import { ScoreTrend } from "@/components/score-trend";
import {
  Bar,
  Button,
  ButtonLink,
  Card,
  CardLabel,
  EmptyState,
  Mono,
  Pill,
  ScoreDonut,
  SeverityPill,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { CATEGORY_LABEL, CATEGORY_ORDER, NO_GUARANTEE } from "@/lib/labels";
import {
  activeCrawl,
  failingRules,
  itemTagCounts,
  latestCompletedCrawl,
  previousCompletedCrawl,
  scoreTrend,
} from "@/lib/queries";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDateTime, formatNumber, hostOf } from "@/lib/utils";
import { startAudit } from "./actions";

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const latest = await latestCompletedCrawl(db, project.id);
  const running = await activeCrawl(db, project.id);
  const editable = canEdit(user.role);
  const runAudit = startAudit.bind(null, project.id);

  const header = (
    <PageHeader
      eyebrow={hostOf(project.rootUrl)}
      title="Dashboard"
      actions={
        <>
          {latest && <Pill tone="gray">Last audit: {formatDateTime(latest.crawl.createdAt)}</Pill>}
          {latest && (
            <a
              className="inline-flex h-10 items-center rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold text-ink no-underline hover:bg-canvas hover:text-ink"
              href={`/projects/${project.id}/report/pdf`}
            >
              Export PDF
            </a>
          )}
          {latest && (
            <a
              className="inline-flex h-10 items-center rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold text-ink no-underline hover:bg-canvas hover:text-ink"
              href={`/projects/${project.id}/report/xlsx`}
            >
              Excel
            </a>
          )}
          {running ? (
            <ButtonLink href={`/projects/${project.id}/audits/${running.id}`}>
              View running audit
            </ButtonLink>
          ) : (
            editable && (
              <form action={runAudit}>
                <Button type="submit">Run audit</Button>
              </form>
            )
          )}
        </>
      }
    />
  );

  if (!latest) {
    return (
      <>
        {header}
        <PageBody>
          <EmptyState title={running ? "Your first audit is running" : "No audit yet"}>
            <p className="m-0 text-muted">
              {running
                ? "Results appear here as soon as it finishes."
                : "Run an audit to see the SEO Health Score and what to fix first."}
            </p>
          </EmptyState>
        </PageBody>
      </>
    );
  }

  const { crawl, report } = latest;
  const previous = await previousCompletedCrawl(db, project.id, crawl.id, crawl.createdAt);
  const delta =
    previous?.healthScore != null && report.score.health !== null
      ? report.score.health - previous.healthScore
      : null;
  const trend = await scoreTrend(db, project.id);
  const failing = failingRules(report);
  const totalIssues =
    report.counts.critical + report.counts.high + report.counts.medium + report.counts.low;
  const tags = await itemTagCounts(db, project.id);
  const newPages = previous ? report.pages.crawled - previous.pagesCrawled : 0;

  const tiles = [
    {
      tone: "crit" as const,
      label: "Critical",
      value: report.counts.critical,
      note: "Fix these first",
      sev: "critical",
    },
    {
      tone: "high" as const,
      label: "High",
      value: report.counts.high,
      note: "Large impact",
      sev: "high",
    },
    {
      tone: "med" as const,
      label: "Medium",
      value: report.counts.medium + report.counts.low,
      note: "Plan to fix",
      sev: "medium",
    },
    {
      tone: "pass" as const,
      label: "Passed",
      value: report.counts.passed,
      note: "Checks passing",
      sev: null,
    },
  ];

  return (
    <>
      {header}
      <PageBody>
        <div className="flex flex-col gap-5 xl:flex-row">
          <Card className="flex flex-col items-center gap-3 p-5 xl:w-[290px] xl:shrink-0">
            <CardLabel className="self-start">SEO Health Score</CardLabel>
            <ScoreDonut score={report.score.health} />
            {delta !== null && (
              <Pill tone={delta < 0 ? "crit" : delta > 0 ? "pass" : "gray"}>
                {delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "±0"} since last
                audit
              </Pill>
            )}
            <p className="m-0 text-center text-xs leading-normal text-muted">
              Ruleset v{report.versions.rulesetVersion} · Weights {report.versions.weightsVersion}
              <br />
              Same input always returns the same score
            </p>
          </Card>

          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              {tiles.map((t) => (
                <Card key={t.label} className="flex flex-col gap-2 p-4">
                  <Pill tone={t.tone} className="self-start">
                    {t.label}
                  </Pill>
                  {t.sev ? (
                    <Link
                      href={`/projects/${project.id}/issues?severity=${t.sev}`}
                      className="text-[32px] font-bold leading-none text-ink no-underline hover:text-primary"
                    >
                      {formatNumber(t.value)}
                    </Link>
                  ) : (
                    <span className="text-[32px] font-bold leading-none">
                      {formatNumber(t.value)}
                    </span>
                  )}
                  <span className="text-[13px] text-muted">{t.note}</span>
                </Card>
              ))}
            </div>

            <Card className="p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <CardLabel>Score by category</CardLabel>
                <span className="text-xs text-muted">
                  Weight in overall score shown in brackets
                </span>
              </div>
              <div className="grid grid-cols-1 gap-x-10 gap-y-2.5 md:grid-cols-2">
                {CATEGORY_ORDER.map((c) => {
                  const score = report.score.categories[c];
                  return (
                    <div key={c} className="flex items-center gap-3 text-sm">
                      <span className="flex-1">
                        {CATEGORY_LABEL[c]} ({CATEGORY_WEIGHTS_V1[c]}%)
                      </span>
                      <Bar value={score ?? 0} className="w-16" />
                      <Mono className="w-8 text-right">{score ?? "—"}</Mono>
                    </div>
                  );
                })}
                <span className="text-[13px] text-muted">
                  Authority (off-page) is tracked separately (Phase 4)
                </span>
              </div>
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-5 xl:flex-row">
          <Card className="min-w-0 flex-1 p-5">
            <div className="mb-2 flex items-center justify-between">
              <CardLabel>Top 5 priorities</CardLabel>
              <Link href={`/projects/${project.id}/issues`} className="text-sm font-semibold">
                See all {formatNumber(totalIssues)} issues
              </Link>
            </div>
            {failing.length === 0 ? (
              <p className="m-0 py-6 text-sm text-muted">
                No failing checks. Every applicable rule passes.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Issue</Th>
                      <Th>Pages</Th>
                      <Th>Severity</Th>
                      <Th>Priority</Th>
                      <Th>
                        <span className="sr-only">Action</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {failing.slice(0, 5).map((r) => (
                      <tr key={r.ruleId}>
                        <Td>
                          <div className="font-semibold">{r.title}</div>
                          <div className="text-xs text-muted">
                            {CATEGORY_LABEL[r.category]} · {r.ruleId}
                          </div>
                        </Td>
                        <Td>
                          <Mono>{r.counts.fail}</Mono>
                        </Td>
                        <Td>
                          <SeverityPill severity={r.severity} />
                        </Td>
                        <Td>
                          <Mono>{r.priority.priority.toFixed(1)}</Mono>
                        </Td>
                        <Td className="text-right">
                          <Link
                            href={`/projects/${project.id}/issues/${r.ruleId}`}
                            className="font-semibold"
                          >
                            {r.autoFixable ? "Auto-fix" : "View"}
                          </Link>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-5 xl:w-[330px] xl:shrink-0">
            <Card className="p-5">
              <CardLabel>Score trend · last {trend.length} audits</CardLabel>
              <div className="mt-3">
                <ScoreTrend points={trend} />
              </div>
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <CardLabel>Since last audit</CardLabel>
              {!previous ? (
                <p className="m-0 text-sm text-muted">This is the first audit.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm">
                  <li className="flex items-start gap-2.5">
                    <Pill tone="crit">New</Pill>
                    <span>{tags.new} new failing checks</span>
                  </li>
                  {tags.regressed > 0 && (
                    <li className="flex items-start gap-2.5">
                      <Pill tone="high">Regressed</Pill>
                      <span>{tags.regressed} issues came back</span>
                    </li>
                  )}
                  <li className="flex items-start gap-2.5">
                    <Pill tone="pass">Fixed</Pill>
                    <span>{tags.resolved} issues fixed and verified</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Pill tone="gray">Info</Pill>
                    <span>
                      {newPages === 0
                        ? "Same number of pages crawled"
                        : `${newPages > 0 ? newPages : Math.abs(newPages)} ${newPages > 0 ? "more" : "fewer"} pages crawled`}
                    </span>
                  </li>
                </ul>
              )}
              <Link href={`/projects/${project.id}/issues`} className="text-sm font-semibold">
                Open issue manager
              </Link>
            </Card>
          </div>
        </div>

        <footer className="text-xs leading-relaxed text-muted">
          {NO_GUARANTEE} Data as of {formatDateTime(report.crawledAt)} · snapshot{" "}
          <Mono>{report.versions.snapshotSetHash.slice(0, 12)}</Mono> · crawler v
          {report.versions.crawlerVersion} · ruleset v{report.versions.rulesetVersion} · weights{" "}
          {report.versions.weightsVersion} · AI model {crawl.llmModelId} / prompt{" "}
          {crawl.promptVersion}
        </footer>
      </PageBody>
    </>
  );
}
