import { apiError, authenticate } from "@/lib/api";
import { batchJson, findBatch } from "@/lib/fix-api";

/** GET /v1/fix-batches/{batchId} — preview, approval, publish and verification state per fix. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const principal = await authenticate(request, "sitemap:read");
  if (principal instanceof Response) return principal;
  const { batchId } = await params;
  const batch = await findBatch(principal, batchId);
  if (!batch) return apiError(404, "not_found", "Fix batch not found.");
  return Response.json(batchJson(batch));
}
