import "server-only";
import ExcelJS from "exceljs";
import { forOrganization } from "@seo/db";
import { auth } from "@/auth";
import { itemOrder, itemWhere, parseFilters } from "@/app/projects/[id]/issues/filters";
import { prisma } from "./db";

export const EXPORT_COLUMNS = [
  "rule_id",
  "issue",
  "severity",
  "category",
  "source",
  "priority",
  "url",
  "status",
  "audit_tag",
  "assignee",
  "due_date",
  "first_seen",
  "last_seen",
  "ignored_reason",
] as const;

type Row = Record<(typeof EXPORT_COLUMNS)[number], string>;

/** Issue items matching the issue-manager filters in the request URL (max 50,000). */
export async function exportRows(
  request: Request,
  projectId: string,
): Promise<{ rows: Row[]; host: string } | Response> {
  const session = await auth();
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id } })
    : null;
  if (!user) return new Response("Unauthorized", { status: 401 });
  const db = forOrganization(prisma, user.organizationId);
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return new Response("Not found", { status: 404 });
  const filters = parseFilters(Object.fromEntries(new URL(request.url).searchParams));
  const [items, users] = await Promise.all([
    db.issueItem.findMany({
      where: itemWhere(project.id, filters, user.id),
      include: { issue: true },
      orderBy: itemOrder(filters.sort),
      take: 50_000,
    }),
    db.user.findMany({ select: { id: true, email: true } }),
  ]);
  const email = new Map(users.map((u) => [u.id, u.email]));
  const rows = items.map((i) => ({
    rule_id: i.ruleId,
    issue: i.issue.title,
    severity: i.issue.severity,
    category: i.issue.category,
    source: i.issue.source,
    priority: i.issue.priority.toString(),
    url: i.url,
    status: i.status,
    audit_tag: i.auditTag,
    assignee: i.assigneeId ? (email.get(i.assigneeId) ?? "") : "",
    due_date: i.dueDate ? i.dueDate.toISOString().slice(0, 10) : "",
    first_seen: i.firstSeen.toISOString(),
    last_seen: i.lastSeen.toISOString(),
    ignored_reason: i.ignoredReason ?? "",
  }));
  return { rows, host: new URL(project.rootUrl).host };
}

export function toCsv(rows: Row[]): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return `${[EXPORT_COLUMNS.map(cell).join(","), ...rows.map((r) => EXPORT_COLUMNS.map((c) => cell(r[c])).join(","))].join("\r\n")}\r\n`;
}

export async function toXlsx(rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Issues");
  ws.columns = EXPORT_COLUMNS.map((key) => ({
    header: key,
    key,
    width: key === "url" || key === "issue" ? 50 : 16,
  }));
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
