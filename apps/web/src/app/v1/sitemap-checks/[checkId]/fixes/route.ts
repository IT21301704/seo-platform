import { apiError, authenticate } from "@/lib/api";

/** POST /v1/sitemap-checks/{checkId}/fixes — reserved; auto-fix arrives in Phase 3. */
export async function POST(request: Request): Promise<Response> {
  const principal = await authenticate(request, "sitemap:write");
  if (principal instanceof Response) return principal;
  return apiError(
    501,
    "not_implemented",
    "Sitemap auto-fix (fix batches, approve, rollback) arrives in Phase 3. Use the manual and remove lists meanwhile.",
  );
}
