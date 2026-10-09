import { displayValue } from "@/lib/fixes";
import { requireProject, requireUser } from "@/lib/session";

const cell = (v: string): string => `"${v.replace(/"/g, '""')}"`;

/** Values that pass the re-check, for sites without a publishing integration. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; batchId: string }> },
): Promise<Response> {
  const { id, batchId } = await params;
  const { db } = await requireUser();
  const project = await requireProject(db, id);
  const batch = await db.fixBatch.findFirst({
    where: { id: batchId, projectId: project.id },
    include: { fixes: { orderBy: { url: "asc" } } },
  });
  if (!batch) return new Response("Not found", { status: 404 });
  const rows = [
    ["rule_id", "url", "image_or_link", "current_value", "new_value", "recheck"],
    ...batch.fixes
      .filter((f) => f.recheck === "pass")
      .map((f) => {
        const ref = f.targetRef as { src?: string; from?: string };
        return [
          f.ruleId,
          f.url,
          ref.src ?? ref.from ?? "",
          displayValue(f.kind, f.currentValue),
          displayValue(f.kind, f.newValue),
          f.recheck,
        ];
      }),
  ];
  return new Response(rows.map((r) => r.map(cell).join(",")).join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="fixes-${batch.ruleId}-${batch.number}.csv"`,
    },
  });
}
