import "server-only";
import { urlsetXml } from "@seo/worker/sitemap-lists";

export interface ListRow {
  url: string;
  reason: string | null;
  foundVia: string | null;
  suggestedLastmod: string | null;
  targetFile: string | null;
  sitemapFile: string | null;
  status: number | null;
  added: boolean;
}

const FOUND_VIA: Record<string, string> = {
  crawl: "Crawl",
  internal_links: "Internal links",
  gsc: "Search Console",
};

/** CSV / JSON / XML exports of the manual-add and remove lists (REQUIREMENTS M17). */
export function renderList(
  rows: ListRow[],
  format: string,
  kind: "manual" | "remove",
  filename: string,
): Response {
  if (format === "xml") {
    return new Response(`${urlsetXml(rows)}\n`, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}.xml"`,
      },
    });
  }
  if (format === "csv") {
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header =
      kind === "manual"
        ? ["url", "reason", "found_via", "suggested_lastmod", "target_file", "added"]
        : ["url", "reason", "sitemap", "status"];
    const lines = rows.map((r) =>
      kind === "manual"
        ? [
            r.url,
            r.reason,
            FOUND_VIA[r.foundVia ?? ""] ?? "",
            r.suggestedLastmod,
            r.targetFile,
            r.added,
          ]
        : [r.url, r.reason, r.sitemapFile, r.status],
    );
    return new Response(
      `${[header, ...lines].map((l) => l.map(cell).join(",")).join("\r\n")}\r\n`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}.csv"`,
        },
      },
    );
  }
  const urls =
    kind === "manual"
      ? rows.map((r) => ({
          url: r.url,
          reason: r.reason,
          foundVia: r.foundVia,
          suggestedLastmod: r.suggestedLastmod,
          targetFile: r.targetFile,
          added: r.added,
        }))
      : rows.map((r) => ({
          url: r.url,
          reason: r.reason,
          sitemap: r.sitemapFile,
          status: r.status,
        }));
  return Response.json({ count: urls.length, urls });
}
