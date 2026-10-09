import Link from "next/link";
import { FIX_KINDS, kindForRule } from "@seo/fixes";
import type { FixKind } from "@seo/fixes";
import { PageBody, PageHeader } from "@/components/page-header";
import {
  Button,
  Card,
  CardLabel,
  EmptyState,
  Mono,
  Pill,
  SeverityPill,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { batchLabel } from "@/lib/fixes";
import { failingRules, latestCompletedCrawl } from "@/lib/queries";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDateTime, hostOf, plural } from "@/lib/utils";
import { generateFix } from "./actions";

const STATE_LABEL: Record<
  string,
  { label: string; tone: "pass" | "info" | "med" | "crit" | "gray" }
> = {
  generating: { label: "Preparing preview", tone: "info" },
  preview: { label: "Waiting for review", tone: "info" },
  publishing: { label: "Publishing", tone: "med" },
  verifying: { label: "Verifying", tone: "med" },
  rechecking: { label: "Re-checking (cache)", tone: "med" },
  verified: { label: "Verified", tone: "pass" },
  verify_failed: { label: "Verify failed · rolled back", tone: "crit" },
  rolled_back: { label: "Rolled back", tone: "gray" },
  failed: { label: "Failed", tone: "crit" },
};

export default async function FixesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const latest = await latestCompletedCrawl(db, project.id);
  const fixable = latest ? failingRules(latest.report).filter((r) => r.autoFixable) : [];
  const [batches, wordpress] = await Promise.all([
    db.fixBatch.findMany({
      where: {
        projectId: project.id,
        state: { in: ["generating", "preview", "publishing", "verifying", "rechecking"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { fixes: true } } },
    }),
    db.integration.findFirst({
      where: { projectId: project.id, type: "wordpress", status: "connected" },
    }),
  ]);
  const editor = canEdit(user.role);

  return (
    <>
      <PageHeader eyebrow={hostOf(project.rootUrl)} title="Auto-fix review" />
      <PageBody>
        {error && (
          <p role="alert" className="m-0 rounded-lg bg-crit-bg p-3 text-sm text-crit">
            {error}
          </p>
        )}
        <p className="m-0 max-w-3xl rounded-[10px] border border-[#C9D3F5] bg-primary-soft p-4 text-sm leading-relaxed">
          Detect → Recommend → Preview → Approve → Publish → Verify. Drafts are re-checked by the
          rule engine before you see them, nothing is published without your approval, the old value
          is saved first, and every change can be rolled back from the{" "}
          <Link href={`/projects/${project.id}/changes`}>Change log</Link>.{" "}
          {wordpress ? (
            <>Publishing target: WordPress ({wordpress.externalName}).</>
          ) : (
            <>
              No publishing target yet:{" "}
              <Link href={`/projects/${project.id}/integrations`}>connect WordPress</Link>, or
              download the approved values.
            </>
          )}
        </p>

        {batches.length > 0 && (
          <Card className="overflow-x-auto px-2 pb-2">
            <CardLabel className="px-3 pt-4">In progress</CardLabel>
            <Table>
              <thead>
                <tr>
                  <Th>Batch</Th>
                  <Th>Issue</Th>
                  <Th>Changes</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <Td>
                      <Link
                        href={`/projects/${project.id}/fixes/${b.id}`}
                        className="font-semibold"
                      >
                        #{batchLabel(b.number)}
                      </Link>
                    </Td>
                    <Td>
                      {FIX_KINDS[b.kind as FixKind]?.label ?? b.kind}{" "}
                      <Mono className="text-xs text-muted">{b.ruleId}</Mono>
                    </Td>
                    <Td>
                      <Mono>{b._count.fixes}</Mono>
                    </Td>
                    <Td>
                      <Pill tone={STATE_LABEL[b.state]?.tone ?? "gray"}>
                        {STATE_LABEL[b.state]?.label ?? b.state}
                      </Pill>
                    </Td>
                    <Td className="text-muted">{formatDateTime(b.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {fixable.length === 0 ? (
          <EmptyState title="No auto-fixable issues in the latest audit" />
        ) : (
          <Card className="overflow-x-auto px-2 pb-2">
            <CardLabel className="px-3 pt-4">Auto-fixable issues in the latest audit</CardLabel>
            <Table>
              <thead>
                <tr>
                  <Th>Issue</Th>
                  <Th>Pages</Th>
                  <Th>Severity</Th>
                  <Th>Risk</Th>
                  <Th>Preview</Th>
                </tr>
              </thead>
              <tbody>
                {fixable.map((r) => {
                  const kind = kindForRule(r.ruleId);
                  return (
                    <tr key={r.ruleId}>
                      <Td>
                        <Link
                          href={`/projects/${project.id}/issues/${r.ruleId}`}
                          className="font-semibold"
                        >
                          {r.title}
                        </Link>
                        <div>
                          <Mono className="text-xs text-muted">{r.ruleId}</Mono>
                        </div>
                      </Td>
                      <Td>
                        <Mono>{r.counts.fail}</Mono>
                      </Td>
                      <Td>
                        <SeverityPill severity={r.severity} />
                      </Td>
                      <Td>
                        {kind ? (
                          <Pill tone={kind.risk === "low" ? "pass" : "high"}>
                            {kind.risk === "low" ? "Low · bulk approve" : "High · approve each"}
                          </Pill>
                        ) : (
                          <span className="text-sm text-muted">—</span>
                        )}
                      </Td>
                      <Td>
                        {kind && editor ? (
                          <form action={generateFix.bind(null, project.id, r.ruleId)}>
                            <Button
                              type="submit"
                              size="sm"
                              variant="secondary"
                              aria-label={`Generate and preview fix for ${r.ruleId}`}
                            >
                              Generate &amp; preview
                            </Button>
                          </form>
                        ) : kind ? (
                          <span className="text-sm text-muted">Editors only</span>
                        ) : (
                          <span className="text-sm text-muted">
                            Guide only for now · {plural(r.counts.fail, "item")}
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </PageBody>
    </>
  );
}
