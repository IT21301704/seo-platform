import { exportRows, toXlsx } from "@/lib/issue-export";

/** Excel export of the issue items matching the current filters. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const result = await exportRows(request, id);
  if (result instanceof Response) return result;
  return new Response(new Uint8Array(await toXlsx(result.rows)), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="issues-${result.host}.xlsx"`,
    },
  });
}
