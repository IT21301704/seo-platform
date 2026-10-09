import { FixError, approveFixBatch, rollbackFixes } from "@seo/worker/fixes";
import { enqueueFixJob } from "@seo/worker/queue";
import { z } from "zod";
import { apiError, authenticate } from "@/lib/api";
import { batchJson, findBatch } from "@/lib/fix-api";
import { googleHttp } from "@/lib/google";

const BodySchema = z.object({ fixIds: z.array(z.string()).max(200).optional() }).default({});

/**
 * POST /v1/fix-batches/{batchId}/approve — approve and publish. Low-risk batches default to every
 * fix that passed the re-check; high-risk batches must list each fix in "fixIds".
 * POST /v1/fix-batches/{batchId}/rollback — restore the saved old values (all, or "fixIds").
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string; action: string }> },
): Promise<Response> {
  const { batchId, action } = await params;
  if (action !== "approve" && action !== "rollback")
    return apiError(404, "not_found", "Unknown action.");
  const principal = await authenticate(request, "sitemap:write");
  if (principal instanceof Response) return principal;
  const batch = await findBatch(principal, batchId);
  if (!batch) return apiError(404, "not_found", "Fix batch not found.");
  const text = await request.text();
  let parsedJson: unknown;
  try {
    parsedJson = text ? JSON.parse(text) : {};
  } catch {
    return apiError(400, "bad_request", "Body must be JSON.");
  }
  const body = BodySchema.safeParse(parsedJson);
  if (!body.success) return apiError(400, "bad_request", "Body must be { fixIds?: string[] }.");
  const now = () => new Date();

  try {
    if (action === "approve") {
      let ids = body.data.fixIds;
      if (!ids) {
        if (batch.risk === "high") {
          return apiError(
            400,
            "approve_each",
            "High-risk fixes are approved one by one: list them in fixIds.",
          );
        }
        ids = batch.fixes
          .filter((f) => f.state === "draft" && f.recheck === "pass")
          .map((f) => f.id);
      }
      const result = await approveFixBatch(batchId, ids, null, { db: principal.db, now });
      await principal.db.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          action: "fix.batch.approve.api",
          entityType: "fix_batch",
          entityId: batchId,
          after: { by: principal.subject, fixes: ids },
          source: "user",
        },
      });
      await enqueueFixJob({ batchId, organizationId: principal.organizationId, action: "apply" });
      const updated = await findBatch(principal, batchId);
      return Response.json(
        { approved: result.approved, batch: updated ? batchJson(updated) : null },
        { status: 202 },
      );
    }
    const result = await rollbackFixes(batchId, body.data.fixIds ?? null, null, {
      db: principal.db,
      http: googleHttp(),
      now,
    });
    const updated = await findBatch(principal, batchId);
    return Response.json({ ...result, batch: updated ? batchJson(updated) : null });
  } catch (error) {
    if (error instanceof FixError) return apiError(409, "not_allowed", error.message);
    throw error;
  }
}
