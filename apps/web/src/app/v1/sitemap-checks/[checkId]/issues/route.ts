import type { RuleReport } from "@seo/scoring";
import { apiError, authenticate, findCheck, paging } from "@/lib/api";

/** GET /v1/sitemap-checks/{checkId}/issues — failing checks; filter by severity, rule, status; paged. */
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
  const severity = url.searchParams.get("severity");
  const rule = url.searchParams.get("rule");
  const status = url.searchParams.get("status");

  const items = await principal.db.issueItem.findMany({
    where: { projectId: check.projectId, ruleId: { startsWith: "SMP-" } },
    select: { stableKey: true, status: true, auditTag: true },
  });
  const itemByKey = new Map(items.map((i) => [i.stableKey, i]));
  const rows = (check.results as unknown as RuleReport[])
    .filter((r) => (!severity || r.severity === severity) && (!rule || r.ruleId === rule))
    .flatMap((r) =>
      r.outcomes
        .filter((o) => o.result === "fail")
        .map((o) => {
          const item = itemByKey.get(`${r.ruleId}|${o.url ?? "site"}`);
          return {
            ruleId: r.ruleId,
            title: r.title,
            severity: r.severity,
            autoFixable: r.autoFixable,
            url: o.url,
            status: item?.status ?? "open",
            auditTag: item?.auditTag ?? "new",
            evidence: o.evidence,
          };
        }),
    )
    .filter((r) => !status || r.status === status);
  const { page, pageSize, skip } = paging(url);
  return Response.json({
    checkId,
    page,
    pageSize,
    total: rows.length,
    items: rows.slice(skip, skip + pageSize),
  });
}
