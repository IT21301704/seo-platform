import { loadKeywordData } from "@/lib/keywords";
import { requireProject, requireUser } from "@/lib/session";

const cell = (v: string | number): string => `"${String(v).replace(/"/g, '""')}"`;

/** CSV of the keyword ideas for the current seed and country (volume/difficulty stay empty). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(request.url);
  const { db } = await requireUser();
  const project = await requireProject(db, id);
  const country = url.searchParams.get("country");
  const data = await loadKeywordData(db, project, {
    seed: (url.searchParams.get("q") ?? "").slice(0, 100),
    country: country && country !== "all" ? country : null,
  });
  const rows = [
    [
      "keyword",
      "intent",
      "volume",
      "difficulty",
      "position",
      "impressions",
      "clicks",
      "mapped_page",
      "snapshot_date",
    ],
    ...(data?.ideas ?? []).map((s) => [
      s.keyword,
      s.intent,
      "",
      "",
      s.position,
      s.impressions,
      s.clicks,
      data?.map.find((m) => m.keyword === s.keyword)?.url ?? "",
      data?.snapshot.endDate ?? "",
    ]),
  ];
  return new Response(rows.map((r) => r.map(cell).join(",")).join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="keywords.csv"',
    },
  });
}
