import Link from "next/link";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, EmptyState, Mono, SeverityPill, Table, Td, Th } from "@/components/ui";
import { PREVIEWABLE } from "@/lib/fixes";
import { failingRules, latestCompletedCrawl } from "@/lib/queries";
import { requireProject, requireUser } from "@/lib/session";
import { hostOf } from "@/lib/utils";

export default async function FixesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireUser();
  const project = await requireProject(db, id);
  const latest = await latestCompletedCrawl(db, project.id);
  const fixable = latest ? failingRules(latest.report).filter((r) => r.autoFixable) : [];

  return (
    <>
      <PageHeader eyebrow={hostOf(project.rootUrl)} title="Auto-fix review" />
      <PageBody>
        <p className="m-0 max-w-3xl rounded-[10px] border border-[#C9D3F5] bg-primary-soft p-4 text-sm leading-relaxed">
          Phase 1 shows read-only previews: AI drafts a change, the rule engine re-checks it, and
          you can review it. Approving and publishing through the WordPress plugin, verification and
          rollback arrive in Phase 3. Nothing on your website is changed.
        </p>
        {fixable.length === 0 ? (
          <EmptyState title="No auto-fixable issues in the latest audit" />
        ) : (
          <Card className="overflow-x-auto px-2 pb-2">
            <Table>
              <thead>
                <tr>
                  <Th>Issue</Th>
                  <Th>Pages</Th>
                  <Th>Severity</Th>
                  <Th>Preview</Th>
                </tr>
              </thead>
              <tbody>
                {fixable.map((r) => (
                  <tr key={r.ruleId}>
                    <Td>
                      <div className="font-semibold">{r.title}</div>
                      <Mono className="text-xs text-muted">{r.ruleId}</Mono>
                    </Td>
                    <Td>
                      <Mono>{r.counts.fail}</Mono>
                    </Td>
                    <Td>
                      <SeverityPill severity={r.severity} />
                    </Td>
                    <Td>
                      {PREVIEWABLE.has(r.ruleId) ? (
                        <Link
                          href={`/projects/${project.id}/fixes/preview-${r.ruleId.toLowerCase()}`}
                          className="font-semibold"
                        >
                          Review AI drafts
                        </Link>
                      ) : (
                        <span className="text-sm text-muted">Phase 3</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </PageBody>
    </>
  );
}
