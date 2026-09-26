import type { SitemapListType } from "@seo/db";
import { apiError, authenticate, findCheck, paging } from "@/lib/api";

/** GET /v1/sitemap-checks/{checkId}/urls — every sitemap URL with status, indexability and GSC state. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ checkId: string }> },
): Promise<Response> {
  const { checkId } = await params;
  const principal = await authenticate(request, "sitemap:read");
  if (principal instanceof Response) return principal;
  const check = await findCheck(principal, checkId);
  if (!check) return apiError(404, "not_found", "Sitemap check not found.");
  const url = new URL(request.url);
  const list = url.searchParams.get("list") as SitemapListType | null;
  const where = {
    checkId,
    inSitemap: true,
    ...(list && ["ok", "remove"].includes(list) ? { listType: list } : {}),
  };
  const { page, pageSize, skip } = paging(url, 1000);
  const [total, rows] = await Promise.all([
    principal.db.sitemapUrl.count({ where }),
    principal.db.sitemapUrl.findMany({ where, orderBy: { url: "asc" }, skip, take: pageSize }),
  ]);
  return Response.json({
    checkId,
    page,
    pageSize,
    total,
    urls: rows.map((r) => ({
      url: r.url,
      sitemap: r.sitemapFile,
      status: r.status,
      indexable: r.indexable,
      gscState: r.gscState,
      list: r.listType,
      reason: r.reason,
      lastmod: r.suggestedLastmod,
    })),
  });
}
