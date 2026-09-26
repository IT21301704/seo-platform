import type { Prisma } from "@seo/db";
import { createSitemapCheck } from "@seo/worker/crawls";
import { enqueueSitemapCheck } from "@seo/worker/queue";
import { apiError, authenticate } from "@/lib/api";

/** POST /v1/projects/{projectId}/sitemap-checks — start a check (async). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await params;
  const principal = await authenticate(request, "sitemap:write");
  if (principal instanceof Response) return principal;
  if (principal.projectId && principal.projectId !== projectId)
    return apiError(404, "not_found", "Project not found.");
  const project = await principal.db.project.findUnique({ where: { id: projectId } });
  if (!project) return apiError(404, "not_found", "Project not found.");
  const running = await principal.db.sitemapCheck.findFirst({
    where: { projectId, status: { in: ["queued", "running"] } },
  });
  if (running)
    return Response.json({ checkId: running.id, status: running.status }, { status: 202 });
  const check = await createSitemapCheck(principal.db, projectId, "api");
  await enqueueSitemapCheck({ checkId: check.id, organizationId: principal.organizationId });
  await principal.db.auditLog.create({
    data: {
      organizationId: principal.organizationId,
      action: "sitemap_check.start",
      entityType: "sitemap_check",
      entityId: check.id,
      source: "user",
      after: { via: "api", subject: principal.subject },
    } as Prisma.AuditLogUncheckedCreateInput,
  });
  return Response.json(
    { checkId: check.id, status: check.status },
    { status: 202, headers: { location: `/v1/sitemap-checks/${check.id}` } },
  );
}
