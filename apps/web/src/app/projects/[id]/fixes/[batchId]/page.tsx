import Link from "next/link";
import { notFound } from "next/navigation";
import { DESCRIPTION_MAX, DESCRIPTION_MIN } from "@seo/rules";
import type { DescriptionCheck } from "@seo/rules";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button, Card, EmptyState, Mono, Pill, Table, Td, Th } from "@/components/ui";
import { loadDescriptionPreview } from "@/lib/fixes";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { pathOf, plural } from "@/lib/utils";
import { generateDrafts } from "../actions";

const CHECK_LABEL: Record<Exclude<DescriptionCheck, "pass">, string> = {
  missing: "Empty",
  "too short": `Too short (min ${DESCRIPTION_MIN})`,
  "too long": `Too long (max ${DESCRIPTION_MAX})`,
  duplicate: "Duplicate",
};

const STEPS = ["Detect", "Recommend", "Preview", "Approve", "Publish", "Verify"];

export default async function FixPreviewPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>;
}) {
  const { id, batchId } = await params;
  if (batchId !== "preview-onp-004") notFound();
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const preview = await loadDescriptionPreview(db, project.id, false);
  const passing = preview?.rows.filter((r) => r.check === "pass").length ?? 0;
  const needEdit = preview?.rows.filter((r) => r.check !== null && r.check !== "pass").length ?? 0;
  const generate = generateDrafts.bind(null, project.id);

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/projects/${project.id}/issues/ONP-004`}>
              ONP-004 Missing meta description
            </Link>{" "}
            · {plural(preview?.rows.length ?? 0, "page")}
          </>
        }
        title="Review AI fixes"
        actions={
          <>
            {canEdit(user.role) && preview?.llmConfigured && (
              <form action={generate}>
                <Button type="submit" variant="secondary">
                  {preview.generated ? "Regenerate all" : "Generate drafts"}
                </Button>
              </form>
            )}
            <Button
              type="button"
              disabled
              title="Publishing arrives in Phase 3 with the WordPress plugin"
            >
              Approve {passing} &amp; publish
            </Button>
          </>
        }
      />
      <PageBody>
        <Card className="flex flex-wrap items-center gap-2 px-5 py-3">
          {STEPS.map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              <Pill tone={i < 2 ? "pass" : i === 2 ? "info" : "gray"}>
                {i + 1} {step}
                {i < 2 ? " ✓" : ""}
              </Pill>
              {i < STEPS.length - 1 && <span className="text-muted">—</span>}
            </span>
          ))}
          <span className="ml-auto text-sm text-muted">
            Publishing target: none connected (WordPress plugin arrives in Phase 3)
          </span>
        </Card>

        {!preview || preview.rows.length === 0 ? (
          <EmptyState title="No pages need a meta description in the latest audit" />
        ) : (
          <>
            {!preview.llmConfigured && (
              <p className="m-0 rounded-lg bg-med-bg p-3 text-sm text-med">
                No AI model is configured. Set ANTHROPIC_API_KEY (and optionally LLM_MODEL_ID) to
                generate drafts. The pages that need a description are listed below.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Pill tone="pass">{passing} pass re-check</Pill>
              <Pill tone="crit">{needEdit} need your edit</Pill>
              <span className="ml-auto text-sm text-muted">
                Showing {plural(preview.rows.length, "page")}
              </span>
            </div>
            <Card className="overflow-x-auto px-2 pb-2">
              <Table>
                <thead>
                  <tr>
                    <Th className="w-10">
                      <span className="sr-only">Approve</span>
                    </Th>
                    <Th>Page</Th>
                    <Th>Current</Th>
                    <Th>AI suggestion</Th>
                    <Th>Chars</Th>
                    <Th>Re-check</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.url}>
                      <Td>
                        <input
                          type="checkbox"
                          disabled
                          defaultChecked={row.check === "pass"}
                          aria-label={`Approve ${pathOf(row.url)} (Phase 3)`}
                          className="h-4 w-4"
                        />
                      </Td>
                      <Td>
                        <Mono>{pathOf(row.url)}</Mono>
                      </Td>
                      <Td className="text-muted">{row.current ? row.current : <em>empty</em>}</Td>
                      <Td className="max-w-md">
                        {row.suggestion ?? <span className="text-muted">—</span>}
                      </Td>
                      <Td>
                        <Mono>{row.suggestion?.length ?? "—"}</Mono>
                      </Td>
                      <Td>
                        {row.check === null ? (
                          <span className="text-muted">—</span>
                        ) : row.check === "pass" ? (
                          <Pill tone="pass">Pass</Pill>
                        ) : (
                          <Pill tone="crit">{CHECK_LABEL[row.check]}</Pill>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <p className="m-0 rounded-[10px] border border-[#C9D3F5] bg-primary-soft p-4 text-sm">
              When publishing arrives, current values are saved first, so you can roll back the
              whole batch or single pages from the Change log.
              {preview.modelId && preview.generated
                ? ` Drafts by ${preview.modelId}; the rule engine re-checked every draft.`
                : ""}
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}
