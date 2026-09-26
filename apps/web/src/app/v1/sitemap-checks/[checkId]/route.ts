import { checkSummary } from "@seo/worker/sitemap-check";
import { apiError, authenticate, findCheck } from "@/lib/api";

/** GET /v1/sitemap-checks/{checkId} — status, score, counts, versions. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ checkId: string }> },
): Promise<Response> {
  const { checkId } = await params;
  const principal = await authenticate(request, "sitemap:read");
  if (principal instanceof Response) return principal;
  const check = await findCheck(principal, checkId);
  if (!check) return apiError(404, "not_found", "Sitemap check not found.");
  return Response.json(checkSummary(check));
}
