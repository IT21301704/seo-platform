import { apiError, authenticate, findCheck } from "@/lib/api";
import { renderList } from "@/lib/url-lists";

/** GET /v1/sitemap-checks/{checkId}/manual-urls?format=csv|json|xml — URLs to add by hand. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ checkId: string }> },
): Promise<Response> {
  const { checkId } = await params;
  const principal = await authenticate(request, "sitemap:read");
  if (principal instanceof Response) return principal;
  const check = await findCheck(principal, checkId);
  if (!check) return apiError(404, "not_found", "Sitemap check not found.");
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  if (!["csv", "json", "xml"].includes(format))
    return apiError(400, "invalid_format", "format must be csv, json or xml.");
  const rows = await principal.db.sitemapUrl.findMany({
    where: { checkId, listType: "manual_add" },
    orderBy: { url: "asc" },
  });
  return renderList(rows, format, "manual", `${checkId}-manual-urls`);
}
