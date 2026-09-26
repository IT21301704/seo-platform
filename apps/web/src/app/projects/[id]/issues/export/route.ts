import { exportRows, toCsv } from "@/lib/issue-export";

/** CSV export of the issue items matching the current filters (screen 04 → Export). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const result = await exportRows(request, id);
  if (result instanceof Response) return result;
  return new Response(toCsv(result.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="issues-${result.host}.csv"`,
    },
  });
}
