import Link from "next/link";
import { KEYWORD_CHECKS } from "@seo/keywords";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardLabel, Mono, Pill, SeverityPill, Table, Td, Th } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/labels";
import { requireProject, requireUser } from "@/lib/session";
import { formatShortDate, pathOf } from "@/lib/utils";

/** Issue detail for keyword issues (KWD-001, KWD-002), which come from keyword research. */
export async function KeywordIssue({
  projectId,
  ruleId,
}: {
  projectId: string;
  ruleId: keyof typeof KEYWORD_CHECKS;
}) {
  const check = KEYWORD_CHECKS[ruleId];
  const { db } = await requireUser();
  const project = await requireProject(db, projectId);
  const items = await db.issueItem.findMany({
    where: { projectId: project.id, ruleId, auditTag: { not: "resolved" } },
    orderBy: { url: "asc" },
    take: 200,
  });
  const p = `/projects/${project.id}`;
  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={`${p}/issues?source=keywords`}>Issues</Link> / {ruleId}
          </>
        }
        title={check.title}
        actions={
          <>
            <SeverityPill severity={check.severity} />
            <Pill tone="gray">Keywords · not in the Health Score</Pill>
          </>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-5 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <Card className="flex flex-col gap-3 p-5">
              <CardLabel>What we found</CardLabel>
              <p className="m-0 text-[17px] font-semibold">
                {items.length === 0
                  ? "Nothing open for this check."
                  : `${items.length} page${items.length === 1 ? "" : "s"} affected.`}
              </p>
              <p className="m-0 text-sm text-muted">
                {ruleId} · {check.passCondition} Based on Search Console data and your keyword map;
                see{" "}
                <Link
                  href={`${p}/keywords?tab=${ruleId === "KWD-002" ? "cannibalization" : "map"}`}
                >
                  Keyword research
                </Link>
                .
              </p>
              {items.length > 0 && (
                <Table>
                  <thead>
                    <tr>
                      <Th>Page</Th>
                      <Th>Details</Th>
                      <Th>Status</Th>
                      <Th>Since</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const ev = item.evidence as {
                        keywords?: string[];
                        competesWith?: string[];
                        keyword?: string;
                        missingFrom?: string[];
                      };
                      return (
                        <tr key={item.id}>
                          <Td>
                            <Mono>{pathOf(item.url)}</Mono>
                          </Td>
                          <Td className="text-sm">
                            {ruleId === "KWD-002"
                              ? `${(ev.keywords ?? []).map((k) => `"${k}"`).join(", ")} · competes with ${(ev.competesWith ?? []).map((u) => pathOf(u)).join(", ")}`
                              : `"${ev.keyword ?? ""}" missing from ${(ev.missingFrom ?? []).join(", ").replace("h1", "H1")}`}
                          </Td>
                          <Td>{STATUS_LABEL[item.status]}</Td>
                          <Td className="text-muted">{formatShortDate(item.firstSeen)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
          <div className="flex flex-col gap-5 xl:w-[360px]">
            <Card className="flex flex-col gap-2 p-5">
              <CardLabel>Why it matters</CardLabel>
              <p className="m-0 text-sm leading-relaxed">{check.why}</p>
              <p className="m-0 text-xs text-muted">This does not guarantee rankings.</p>
            </Card>
            <Card className="flex flex-col gap-2 p-5">
              <CardLabel>How to fix</CardLabel>
              <ol className="m-0 flex flex-col gap-1 pl-5 text-sm">
                {check.fix.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
