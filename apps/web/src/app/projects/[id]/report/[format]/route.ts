import { forOrganization } from "@seo/db";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { latestCompletedCrawl } from "@/lib/queries";
import { reportPdf, reportXlsx } from "@/lib/report-export";

/** PDF and Excel export of the latest report (REQUIREMENTS M8). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; format: string }> },
): Promise<Response> {
  const { id, format } = await params;
  if (format !== "pdf" && format !== "xlsx") return new Response("Not found", { status: 404 });
  const session = await auth();
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id } })
    : null;
  if (!user) return new Response("Unauthorized", { status: 401 });
  const db = forOrganization(prisma, user.organizationId);
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return new Response("Not found", { status: 404 });
  const latest = await latestCompletedCrawl(db, project.id);
  if (!latest) return new Response("No completed audit yet", { status: 404 });

  const input = {
    rootUrl: project.rootUrl,
    report: latest.report,
    llmModelId: latest.crawl.llmModelId,
    promptVersion: latest.crawl.promptVersion,
    createdAt: latest.crawl.createdAt,
  };
  const host = new URL(project.rootUrl).host;
  const date = latest.crawl.createdAt.toISOString().slice(0, 10);
  if (format === "pdf") {
    return new Response(new Uint8Array(await reportPdf(input)), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="seo-report-${host}-${date}.pdf"`,
      },
    });
  }
  return new Response(new Uint8Array(await reportXlsx(input)), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="seo-report-${host}-${date}.xlsx"`,
    },
  });
}
