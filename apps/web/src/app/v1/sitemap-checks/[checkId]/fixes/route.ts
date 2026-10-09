import { SITEMAP_FIX_RULE_IDS } from "@seo/fixes";
import { createFixBatch } from "@seo/worker/fixes";
import { enqueueFixJob } from "@seo/worker/queue";
import { z } from "zod";
import { apiError, authenticate, findCheck } from "@/lib/api";

const BodySchema = z.object({ ruleIds: z.array(z.string()).max(20).optional() }).default({});

/**
 * POST /v1/sitemap-checks/{checkId}/fixes — creates fix batches (previews) for the check's failing
 * sitemap rules that have an automatic fix. Nothing is published until a batch is approved.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ checkId: string }> },
): Promise<Response> {
  const principal = await authenticate(request, "sitemap:write");
  if (principal instanceof Response) return principal;
  const { checkId } = await params;
  const check = await findCheck(principal, checkId);
  if (!check) return apiError(404, "not_found", "Sitemap check not found.");
  if (check.status !== "completed")
    return apiError(409, "not_ready", "The check has not completed.");
  const text = await request.text();
  const body = BodySchema.safeParse(text ? JSON.parse(text) : {});
  if (!body.success) return apiError(400, "bad_request", "Body must be { ruleIds?: string[] }.");

  const results = (check.results ?? []) as { ruleId: string; status: string }[];
  const wanted = body.data.ruleIds ? new Set(body.data.ruleIds) : null;
  const ruleIds = results
    .filter(
      (r) =>
        r.status === "fail" &&
        SITEMAP_FIX_RULE_IDS.includes(r.ruleId) &&
        (!wanted || wanted.has(r.ruleId)),
    )
    .map((r) => r.ruleId);
  if (ruleIds.length === 0) {
    return Response.json({
      checkId,
      batches: [],
      message: "No failing sitemap rule with an automatic fix.",
    });
  }
  const batches = [];
  for (const ruleId of ruleIds) {
    const batch = await createFixBatch(principal.db, {
      projectId: check.projectId,
      organizationId: principal.organizationId,
      ruleId,
      userId: null,
      sitemapCheckId: check.id,
    });
    await enqueueFixJob({
      batchId: batch.id,
      organizationId: principal.organizationId,
      action: "generate",
    });
    batches.push({
      batchId: batch.id,
      ruleId,
      state: batch.state,
      href: `/v1/fix-batches/${batch.id}`,
    });
  }
  return Response.json({ checkId, batches }, { status: 202 });
}
