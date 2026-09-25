import { notFound } from "next/navigation";
import { RULES } from "@seo/rules";
import { readProgress } from "@seo/worker/progress";
import { AuditProgress } from "@/components/audit-progress";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui";
import type { AuditStatus } from "@/lib/audit-status";
import { TERMINAL } from "@/lib/audit-status";
import { redis } from "@/lib/db";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDateTime, hostOf } from "@/lib/utils";
import { cancelAudit } from "../../actions";

export default async function AuditPage({ params }: { params: Promise<{ id: string; auditId: string }> }) {
  const { id, auditId } = await params;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const crawl = await db.crawl.findUnique({ where: { id: auditId } });
  if (!crawl || crawl.projectId !== project.id) notFound();

  const initial: AuditStatus = {
    id: crawl.id,
    status: crawl.status,
    inputType: crawl.inputType,
    pageLimit: project.pageLimit,
    pagesCrawled: crawl.pagesCrawled,
    pagesRendered: crawl.pagesRendered,
    snapshotSetHash: crawl.snapshotSetHash,
    healthScore: crawl.healthScore,
    error: crawl.error,
    versions: { crawler: crawl.crawlerVersion, ruleset: crawl.rulesetVersion, weights: crawl.weightsVersion, model: crawl.llmModelId, prompt: crawl.promptVersion },
    progress: await readProgress(redis, crawl.id),
  };
  const cancel = cancelAudit.bind(null, project.id, crawl.id);
  const running = !TERMINAL.has(crawl.status);

  return (
    <>
      <PageHeader
        eyebrow={`${hostOf(project.rootUrl)} · started ${formatDateTime(crawl.createdAt)}`}
        title={running ? "Audit in progress" : crawl.status === "completed" ? "Audit complete" : "Audit stopped"}
        actions={
          running &&
          canEdit(user.role) && (
            <form action={cancel}>
              <Button type="submit" variant="secondary">
                Cancel audit
              </Button>
            </form>
          )
        }
      />
      <PageBody>
        <AuditProgress initial={initial} resultsHref={`/projects/${project.id}`} ruleCount={RULES.length} />
      </PageBody>
    </>
  );
}
