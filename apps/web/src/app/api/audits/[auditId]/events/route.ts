import { forOrganization } from "@seo/db";
import { readProgress } from "@seo/worker/progress";
import { auth } from "@/auth";
import type { AuditStatus } from "@/lib/audit-status";
import { TERMINAL } from "@/lib/audit-status";
import { prisma, redis } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Server-Sent Events: pushes the audit's status once a second until it finishes (screen 02). */
export async function GET(request: Request, { params }: { params: Promise<{ auditId: string }> }): Promise<Response> {
  const { auditId } = await params;
  const session = await auth();
  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id } }) : null;
  if (!user) return new Response("Unauthorized", { status: 401 });
  const db = forOrganization(prisma, user.organizationId);

  const load = async (): Promise<AuditStatus | null> => {
    const crawl = await db.crawl.findUnique({ where: { id: auditId }, include: { project: { select: { pageLimit: true } } } });
    if (!crawl) return null;
    return {
      id: crawl.id,
      status: crawl.status,
      inputType: crawl.inputType,
      pageLimit: crawl.project.pageLimit,
      pagesCrawled: crawl.pagesCrawled,
      pagesRendered: crawl.pagesRendered,
      snapshotSetHash: crawl.snapshotSetHash,
      healthScore: crawl.healthScore,
      error: crawl.error,
      versions: { crawler: crawl.crawlerVersion, ruleset: crawl.rulesetVersion, weights: crawl.weightsVersion, model: crawl.llmModelId, prompt: crawl.promptVersion },
      progress: await readProgress(redis, crawl.id),
    };
  };

  if (!(await load())) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      request.signal.addEventListener("abort", () => {
        closed = true;
      });
      while (!closed) {
        const status = await load();
        if (!status) break;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(status)}\n\n`));
        if (TERMINAL.has(status.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!closed) controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
