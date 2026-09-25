import { forOrganization } from "@seo/db";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { itemWhere, parseFilters } from "../filters";

/** CSV export of the issue items matching the current filters (screen 04 → Export). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const session = await auth();
  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id } }) : null;
  if (!user) return new Response("Unauthorized", { status: 401 });
  const db = forOrganization(prisma, user.organizationId);
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return new Response("Not found", { status: 404 });

  const filters = parseFilters(Object.fromEntries(new URL(request.url).searchParams));
  const items = await db.issueItem.findMany({
    where: itemWhere(project.id, filters),
    include: { issue: true },
    orderBy: [{ issue: { priority: "desc" } }, { ruleId: "asc" }, { url: "asc" }],
    take: 50_000,
  });
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["rule_id", "issue", "severity", "priority", "url", "status", "audit_tag", "first_seen", "last_seen", "ignored_reason"],
    ...items.map((i) => [
      i.ruleId,
      i.issue.title,
      i.issue.severity,
      i.issue.priority.toString(),
      i.url,
      i.status,
      i.auditTag,
      i.firstSeen.toISOString(),
      i.lastSeen.toISOString(),
      i.ignoredReason ?? "",
    ]),
  ];
  const csv = `${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="issues-${new URL(project.rootUrl).host}.csv"`,
    },
  });
}
