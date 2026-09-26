import { apiError, authenticate } from "@/lib/api";

/** POST /v1/fix-batches/{batchId}/approve|rollback — reserved; auto-fix arrives in Phase 3. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
): Promise<Response> {
  const { action } = await params;
  if (action !== "approve" && action !== "rollback")
    return apiError(404, "not_found", "Unknown action.");
  const principal = await authenticate(request, "sitemap:write");
  if (principal instanceof Response) return principal;
  return apiError(
    501,
    "not_implemented",
    `Fix batch ${action} arrives in Phase 3 with the WordPress plugin.`,
  );
}
