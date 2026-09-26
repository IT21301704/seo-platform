import Link from "next/link";
import { notFound } from "next/navigation";
import { ExplanationSchema, TEMPLATE_MODEL_ID, templateExplanation } from "@seo/llm";
import { RULES_BY_ID } from "@seo/rules";
import type { JsonValue } from "@seo/shared";
import { ActionForm } from "@/components/action-form";
import { IssueHistory } from "@/components/monitoring-charts";
import { PageBody, PageHeader } from "@/components/page-header";
import {
  ButtonLink,
  Card,
  CardLabel,
  Mono,
  Pill,
  SeverityPill,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { CATEGORY_LABEL, FIX_LABEL } from "@/lib/labels";
import { PREVIEWABLE } from "@/lib/fixes";
import { latestCompletedCrawl } from "@/lib/queries";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDateTime, formatNumber, formatShortDate, pathOf, plural } from "@/lib/utils";
import { addComment } from "../actions";

const PAGE_ROWS = 25;

function evidenceText(evidence: Record<string, JsonValue>): string {
  return Object.entries(evidence)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ")
    .slice(0, 240);
}

export default async function IssueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; ruleId: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { id, ruleId } = await params;
  const { all } = await searchParams;
  const rule = RULES_BY_ID.get(ruleId);
  if (!rule) notFound();
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const latest = await latestCompletedCrawl(db, project.id);
  const ruleReport = latest?.report.rules.find((r) => r.ruleId === rule.id);
  const issue = await db.issue.findUnique({
    where: { projectId_ruleId: { projectId: project.id, ruleId: rule.id } },
  });
  const cached = issue?.explanationKey
    ? await db.llmOutput.findFirst({ where: { cacheKey: issue.explanationKey } })
    : null;
  const parsed = cached ? ExplanationSchema.safeParse(cached.output) : null;
  const explanation = parsed?.success ? parsed.data : templateExplanation(rule);
  const fromAi = Boolean(
    parsed?.success && cached && !cached.isFallback && cached.modelId !== TEMPLATE_MODEL_ID,
  );

  const failing = ruleReport?.outcomes.filter((o) => o.result === "fail") ?? [];
  const applicable = (ruleReport?.counts.pass ?? 0) + (ruleReport?.counts.fail ?? 0);
  const siteLevel = failing.length > 0 && failing.every((o) => o.url === null);
  const fixKey = ruleReport?.fixType ?? "guide";
  const preview = PREVIEWABLE.has(rule.id) && failing.length > 0;
  const previewHref = `/projects/${project.id}/fixes/preview-${rule.id.toLowerCase()}`;
  const shown = all ? failing : failing.slice(0, PAGE_ROWS);

  const [ga4, recent, comments] = await Promise.all([
    db.ga4Snapshot.findFirst({ where: { projectId: project.id }, orderBy: { fetchedAt: "desc" } }),
    db.crawl.findMany({
      where: { projectId: project.id, status: "completed" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, createdAt: true },
    }),
    issue
      ? db.issueComment.findMany({
          where: { issueId: issue.id },
          include: { author: { select: { name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);
  // Visits per page from the latest GA4 snapshot (sessions, last 28 days).
  const visits = new Map(
    ((ga4?.rows ?? []) as { path: string; sessions: number }[]).map((r) => [r.path, r.sessions]),
  );
  const visitsOf = (url: string | null) => (url ? visits.get(new URL(url).pathname) : undefined);
  // M11: failing items of this rule per audit.
  const counts = await db.checkResult.groupBy({
    by: ["crawlId"],
    where: { crawlId: { in: recent.map((c) => c.id) }, ruleId: rule.id, result: "fail" },
    _count: { _all: true },
  });
  const countByCrawl = new Map(counts.map((c) => [c.crawlId, c._count._all]));
  const history = [...recent]
    .reverse()
    .map((c) => ({ label: formatShortDate(c.createdAt), count: countByCrawl.get(c.id) ?? 0 }));

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/projects/${project.id}/issues`}>Issues</Link> / {rule.id}
          </>
        }
        title={rule.title}
        actions={
          <>
            <SeverityPill severity={rule.severity} />
            <Pill
              tone={fixKey === "auto-low" ? "pass" : fixKey === "auto-approve" ? "high" : "gray"}
            >
              {FIX_LABEL[fixKey]}
            </Pill>
            {preview && <ButtonLink href={previewHref}>Generate &amp; preview fix</ButtonLink>}
          </>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-5 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <Card className="flex flex-col gap-3 p-5">
              <CardLabel>What we found</CardLabel>
              <p className="m-0 text-[17px] font-semibold">
                {!ruleReport || ruleReport.status === "na"
                  ? "This check does not apply to this site in the latest audit."
                  : failing.length === 0
                    ? "This check passes in the latest audit."
                    : siteLevel
                      ? "This check fails for the whole site."
                      : `${failing.length} of ${applicable} checked URLs fail this check.`}
              </p>
              <p className="m-0 rounded-lg bg-canvas p-3 font-mono text-[13px] leading-relaxed text-gray">
                Rule {rule.id} · v{rule.version} · {CATEGORY_LABEL[rule.category]} ·{" "}
                {rule.passCondition}
              </p>
            </Card>

            {failing.length > 0 && (
              <Card className="px-2 pb-2 pt-4">
                <div className="flex items-baseline justify-between px-3">
                  <CardLabel>Affected pages</CardLabel>
                  <span className="text-xs text-muted">
                    {ga4
                      ? `Visits: Google Analytics sessions ${ga4.startDate} to ${ga4.endDate}${ga4.provider === "demo" ? " (demo data)" : ""}`
                      : "Connect Google Analytics to see visits"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Page</Th>
                        <Th>Details</Th>
                        <Th>Visits</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((o) => (
                        <tr key={o.url ?? "site"}>
                          <Td>
                            <Mono>{pathOf(o.url)}</Mono>
                          </Td>
                          <Td className="max-w-md text-[13px] text-muted">
                            {evidenceText(o.evidence)}
                          </Td>
                          <Td>
                            <Mono>
                              {visitsOf(o.url) === undefined
                                ? "—"
                                : formatNumber(visitsOf(o.url) ?? 0)}
                            </Mono>
                          </Td>
                          <Td>
                            <Pill tone="crit">Failing</Pill>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                {!all && failing.length > PAGE_ROWS && (
                  <Link href="?all=1" className="mx-3 mt-3 inline-block text-sm font-semibold">
                    Show all {plural(failing.length, "page")}
                  </Link>
                )}
              </Card>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card className="flex flex-col gap-3 p-5">
                <div className="flex items-center gap-2">
                  <CardLabel>Why it matters</CardLabel>
                  <Pill tone={fromAi ? "info" : "gray"}>
                    {fromAi ? "AI explanation" : "Standard explanation"}
                  </Pill>
                </div>
                <p className="m-0 text-[15px] leading-relaxed">{explanation.whyItMatters}</p>
                <p className="m-0 text-sm text-muted">{explanation.seoImpact}</p>
                <p className="m-0 text-xs text-muted">
                  {fromAi && cached
                    ? `Cached · model ${cached.modelId} · prompt ${cached.promptVersion}`
                    : "Written from the rule definition (no AI model configured, or the AI output did not pass validation)."}
                </p>
              </Card>
              <Card className="flex flex-col gap-3 p-5">
                <CardLabel>How to fix</CardLabel>
                <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-relaxed">
                  {explanation.fixSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {explanation.developerInstructions && (
                  <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-lg bg-canvas p-3 font-mono text-[13px]">
                    <code>{explanation.developerInstructions}</code>
                  </pre>
                )}
                {explanation.contentSuggestion && (
                  <p className="m-0 text-sm text-muted">
                    Suggestion: {explanation.contentSuggestion}
                  </p>
                )}
              </Card>
            </div>

            <Card id="comments" className="flex flex-col gap-3 p-5">
              <CardLabel>Comments</CardLabel>
              {comments.length === 0 ? (
                <p className="m-0 text-sm text-muted">No comments yet.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {comments.map((c) => (
                    <li key={c.id} className="rounded-lg bg-canvas p-3">
                      <p className="m-0 text-xs text-muted">
                        <span className="font-semibold text-ink">
                          {c.author.name ?? c.author.email}
                        </span>{" "}
                        · {formatDateTime(c.createdAt)}
                      </p>
                      <p className="m-0 mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {issue && canEdit(user.role) && (
                <ActionForm
                  action={addComment.bind(null, project.id, issue.id)}
                  submitLabel="Add comment"
                >
                  <label className="sr-only" htmlFor="comment-body">
                    Comment
                  </label>
                  <textarea
                    id="comment-body"
                    name="body"
                    rows={3}
                    maxLength={5000}
                    placeholder="Write a comment. Use @name to notify a teammate."
                    className="rounded-lg border border-[#CFCFC8] bg-white p-2 text-sm"
                  />
                </ActionForm>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-5 xl:w-[320px] xl:shrink-0">
            {history.length > 1 && (
              <Card className="p-5">
                <CardLabel>Failing items per audit</CardLabel>
                <IssueHistory points={history} rule={rule.id} />
              </Card>
            )}
            <Card className="p-5">
              <CardLabel>Priority breakdown</CardLabel>
              {ruleReport ? (
                <dl className="m-0 mt-3 grid grid-cols-[1fr_auto] gap-y-2 text-sm">
                  <dt>Impact</dt>
                  <dd className="m-0 text-right font-mono">{ruleReport.priority.impact} / 5</dd>
                  <dt>Confidence</dt>
                  <dd className="m-0 text-right font-mono">
                    {ruleReport.priority.confidence.toFixed(1)}
                  </dd>
                  <dt>
                    Pages factor (
                    {siteLevel ? "site-wide" : plural(ruleReport.priority.failingItems, "page")})
                  </dt>
                  <dd className="m-0 text-right font-mono">
                    × {ruleReport.priority.pagesFactor.toFixed(2)}
                  </dd>
                  <dt>Effort</dt>
                  <dd className="m-0 text-right font-mono">÷ {ruleReport.priority.effort}</dd>
                  <dt className="border-t border-line pt-2 text-base font-semibold">Priority</dt>
                  <dd className="m-0 border-t border-line pt-2 text-right font-mono text-base font-semibold">
                    {ruleReport.priority.priority.toFixed(1)}
                  </dd>
                </dl>
              ) : (
                <p className="m-0 mt-3 text-sm text-muted">No audit yet.</p>
              )}
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <CardLabel>Auto-fix</CardLabel>
              <div className="flex flex-wrap gap-1.5">
                <Pill tone="pass">Detect ✓</Pill>
                <Pill tone={preview ? "pass" : "gray"}>Recommend{preview ? " ✓" : ""}</Pill>
                <Pill tone={preview ? "info" : "gray"}>Preview</Pill>
                <Pill tone="gray">Approve</Pill>
                <Pill tone="gray">Apply</Pill>
                <Pill tone="gray">Verify</Pill>
              </div>
              <p className="m-0 text-sm leading-relaxed text-muted">
                {rule.autoFixable
                  ? rule.riskLevel === "low"
                    ? "Low risk. AI drafts each change, the rule engine re-checks it, and you approve before anything is published. Publishing arrives with the WordPress plugin (Phase 3)."
                    : "Higher risk: each change will need your approval. Auto-fix for this rule arrives in Phase 3."
                  : "This issue needs a manual change. Follow the steps in How to fix."}
              </p>
              {preview && <ButtonLink href={previewHref}>Generate &amp; preview fix</ButtonLink>}
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <CardLabel>Verification</CardLabel>
              <p className="m-0 text-sm text-muted">
                After a fix we re-crawl{" "}
                {siteLevel
                  ? "the site"
                  : failing.length === 1
                    ? "this URL"
                    : `these ${failing.length} URLs`}{" "}
                and re-run {rule.id}.
              </p>
              <div className="flex items-center gap-2">
                <Pill tone={failing.length ? "crit" : "pass"}>Before {failing.length} failing</Pill>
                <span aria-hidden="true">→</span>
                <Pill tone="gray">After: pending</Pill>
              </div>
            </Card>
            <Card className="flex flex-col gap-2 p-5">
              <CardLabel>Possible side effects</CardLabel>
              <p className="m-0 text-sm leading-relaxed text-muted">{explanation.sideEffects}</p>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
