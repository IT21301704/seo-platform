import Link from "next/link";
import { notFound } from "next/navigation";
import { FIX_KINDS } from "@seo/fixes";
import type { FixKind } from "@seo/fixes";
import { AutoRefresh } from "@/components/auto-refresh";
import { FixValueEditor, PublishForm } from "@/components/fix-forms";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button, ButtonLink, Card, EmptyState, Mono, Pill, Table, Td, Th } from "@/components/ui";
import { batchLabel, displayValue, editable } from "@/lib/fixes";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDateTime, pathOf, plural } from "@/lib/utils";
import { editFix, publishBatch, regenerateBatch } from "../actions";

const STEPS = ["Detect", "Recommend", "Preview", "Approve", "Publish", "Verify"];

/** Index of the current step (0-based) for the step bar. */
function stepIndex(state: string): number {
  switch (state) {
    case "generating":
      return 1;
    case "preview":
      return 2;
    case "publishing":
      return 4;
    case "verifying":
    case "rechecking":
      return 5;
    default:
      return 6;
  }
}

const STATE_NOTE: Record<string, string> = {
  generating: "Drafting changes and re-checking them with the rule engine…",
  publishing: "Publishing the approved changes. The old values are saved first.",
  verifying: "Published. Re-crawling the changed pages and re-running the check…",
  rechecking:
    "Published, but the live pages do not show the change yet (often a cache). Checking again later.",
  verified: "Published and verified: the check passes on the live pages.",
  verify_failed:
    "Some changes never showed up on the live pages and were rolled back automatically.",
  rolled_back: "Rolled back: the saved old values were restored.",
  failed: "This batch could not be completed.",
};

export default async function FixBatchPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>;
}) {
  const { id, batchId } = await params;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const batch = await db.fixBatch.findFirst({
    where: { id: batchId, projectId: project.id },
    include: { fixes: { orderBy: [{ url: "asc" }, { createdAt: "asc" }] } },
  });
  if (!batch) notFound();
  const def = FIX_KINDS[batch.kind as FixKind];
  const issue = await db.issue.findUnique({
    where: { projectId_ruleId: { projectId: project.id, ruleId: batch.ruleId } },
  });
  const fixes = batch.fixes;
  const drafts = fixes.filter((f) => f.state === "draft");
  const passing = drafts.filter((f) => f.recheck === "pass");
  const needEdit = drafts.filter((f) => f.recheck !== "pass");
  const preselected = passing.filter((f) => f.approved).length;
  const inPreview = batch.state === "preview";
  const editor = canEdit(user.role) && inPreview;
  const step = stepIndex(batch.state);
  const isText = def.input === "text";
  const pages = new Set(fixes.map((f) => f.url)).size;
  const base = `/projects/${project.id}/fixes/${batch.id}`;

  return (
    <>
      <AutoRefresh active={["generating", "publishing", "verifying"].includes(batch.state)} />
      <PageHeader
        eyebrow={
          <>
            <Link href={`/projects/${project.id}/issues/${batch.ruleId}`}>
              {batch.ruleId} {issue?.title ?? def.label}
            </Link>{" "}
            · {plural(pages, "page")} · batch #{batchLabel(batch.number)}
          </>
        }
        title={batch.source === "ai" ? "Review AI fixes" : "Review fixes"}
        actions={
          editor && (
            <>
              {def.drafted === "ai" && (
                <form action={regenerateBatch.bind(null, project.id, batch.id)}>
                  <Button type="submit" variant="secondary">
                    Regenerate all
                  </Button>
                </form>
              )}
              <PublishForm
                action={publishBatch.bind(null, project.id, batch.id)}
                label={
                  def.risk === "high"
                    ? "Publish approved changes"
                    : `Approve ${preselected} & publish`
                }
                disabled={batch.target !== "wordpress" || passing.length === 0}
                title={
                  batch.target !== "wordpress"
                    ? "Connect WordPress on the Integrations page to publish"
                    : undefined
                }
              />
            </>
          )
        }
      />
      <PageBody>
        <Card className="flex flex-wrap items-center gap-2 px-5 py-3">
          <ol
            className="m-0 flex list-none flex-wrap items-center gap-2 p-0"
            aria-label="Fix steps"
          >
            {STEPS.map((s, i) => (
              <li
                key={s}
                className="flex items-center gap-2"
                aria-current={i === step ? "step" : undefined}
              >
                <Pill tone={i < step ? "pass" : i === step ? "info" : "gray"}>
                  {i + 1} {s}
                  {i < step ? " ✓" : ""}
                </Pill>
                {i < STEPS.length - 1 && (
                  <span className="text-muted" aria-hidden="true">
                    —
                  </span>
                )}
              </li>
            ))}
          </ol>
          <span className="ml-auto text-sm text-muted">
            {batch.target === "wordpress"
              ? `Publishing to ${batch.targetDetail}`
              : batch.targetDetail}
          </span>
        </Card>

        {batch.state !== "preview" && (
          <p
            role="status"
            className={`m-0 rounded-lg p-3 text-sm ${
              batch.state === "verified"
                ? "bg-pass-bg text-pass"
                : ["verify_failed", "failed"].includes(batch.state)
                  ? "bg-crit-bg text-crit"
                  : "bg-med-bg text-med"
            }`}
          >
            {STATE_NOTE[batch.state]}
            {batch.state === "rechecking" &&
              batch.nextVerifyAt &&
              ` Next check ${formatDateTime(batch.nextVerifyAt)}.`}
            {batch.error && batch.state !== "generating" && ` ${batch.error}`}{" "}
            {batch.publishedAt && (
              <Link href={`/projects/${project.id}/changes`}>See the Change log</Link>
            )}
          </p>
        )}

        {batch.state === "generating" ? (
          <EmptyState title="Preparing the preview…">The page updates by itself.</EmptyState>
        ) : fixes.length === 0 ? (
          <EmptyState title="Nothing to fix">
            {batch.error ?? "The check passes in this audit."}
          </EmptyState>
        ) : (
          <>
            {inPreview && (
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="pass">{passing.length} pass re-check</Pill>
                <Pill tone="crit">{needEdit.length} need your edit</Pill>
                {def.risk === "high" && <Pill tone="high">High risk · approve each change</Pill>}
                <span className="ml-auto text-sm text-muted">
                  Showing {fixes.length} of {fixes.length}
                </span>
              </div>
            )}
            {inPreview && batch.source === "ai" && !batch.modelId && (
              <p className="m-0 rounded-lg bg-med-bg p-3 text-sm text-med">
                No AI drafts: no AI model is configured (ANTHROPIC_API_KEY) or it did not answer.
                Type each value with Edit; the rule engine re-checks it.
              </p>
            )}
            <Card className="overflow-x-auto px-2 pb-2">
              <Table>
                <thead>
                  <tr>
                    <Th className="w-10">
                      <span className="sr-only">Approve</span>
                    </Th>
                    <Th>Page</Th>
                    <Th>Current</Th>
                    <Th>{batch.source === "ai" ? "AI suggestion" : "New value"}</Th>
                    {isText && <Th>Chars</Th>}
                    <Th>{inPreview ? "Re-check" : "Result"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {fixes.map((f) => {
                    const current = displayValue(f.kind, f.currentValue);
                    const proposed = displayValue(f.kind, f.newValue);
                    const ref = f.targetRef as { src?: string; from?: string };
                    return (
                      <tr key={f.id}>
                        <Td>
                          <input
                            type="checkbox"
                            name="fix"
                            value={f.id}
                            form="publish-form"
                            defaultChecked={f.approved}
                            disabled={!editor || f.state !== "draft" || f.recheck !== "pass"}
                            aria-label={`Approve ${pathOf(f.url)}${ref.src ? ` image ${pathOf(ref.src)}` : ""}`}
                            className="h-4 w-4"
                          />
                        </Td>
                        <Td className="max-w-56">
                          <Mono className="break-all">{pathOf(f.url)}</Mono>
                          {ref.src && (
                            <div className="text-xs text-muted">Image {pathOf(ref.src)}</div>
                          )}
                          {ref.from && f.kind === "link" && (
                            <div className="text-xs text-muted">Link to {pathOf(ref.from)}</div>
                          )}
                        </Td>
                        <Td className="max-w-64 whitespace-pre-line text-muted">
                          {current || <em>empty</em>}
                        </Td>
                        <Td className="max-w-md whitespace-pre-line">
                          {proposed || <span className="text-muted">—</span>}
                          {editor && f.state === "draft" && editable(f.kind) && (
                            <FixValueEditor
                              action={editFix.bind(null, project.id, batch.id, f.id)}
                              value={
                                f.kind === "redirect"
                                  ? String((f.newValue as { to?: string } | null)?.to ?? "")
                                  : typeof f.newValue === "string"
                                    ? f.newValue
                                    : ""
                              }
                              label={`New value for ${pathOf(f.url)}${ref.src ? ` ${pathOf(ref.src)}` : ""}`}
                              multiline={f.kind === "meta_description"}
                            />
                          )}
                        </Td>
                        {isText && (
                          <Td>
                            <Mono>{typeof f.newValue === "string" ? f.newValue.length : "—"}</Mono>
                          </Td>
                        )}
                        <Td className="max-w-56">
                          <ResultPill state={f.state} recheck={f.recheck} />
                          {(f.recheckDetail || f.error) && (
                            <div className="mt-1 text-xs text-muted">
                              {f.error ?? f.recheckDetail}
                            </div>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
            <p className="m-0 flex flex-wrap items-center gap-3 rounded-[10px] border border-[#C9D3F5] bg-primary-soft p-4 text-sm">
              <span aria-hidden="true">↺</span>
              {batch.target === "wordpress"
                ? "Current values are saved before publishing. You can roll back this whole batch, or single pages, from the Change log."
                : "No publishing target is connected. Download the values that pass the re-check, apply them in your CMS, then re-run the audit."}
              {batch.target !== "wordpress" && (
                <ButtonLink href={`${base}/export`} variant="secondary">
                  Download CSV
                </ButtonLink>
              )}
              {batch.modelId && batch.source === "ai" && (
                <span className="text-muted">
                  Drafts by {batch.modelId} ({batch.promptVersion}); the rule engine re-checked
                  every draft.
                </span>
              )}
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}

function ResultPill({ state, recheck }: { state: string; recheck: string }) {
  switch (state) {
    case "verified":
      return <Pill tone="pass">Before ✗ → After ✓</Pill>;
    case "applied":
      return <Pill tone="med">Published · verifying</Pill>;
    case "verify_failed":
      return <Pill tone="crit">Verify failed · rolled back</Pill>;
    case "rolled_back":
      return <Pill tone="gray">Rolled back</Pill>;
    case "failed":
      return <Pill tone="crit">Not published</Pill>;
    case "skipped":
      return <Pill tone="gray">Manual</Pill>;
    default:
      return recheck === "pass" ? (
        <Pill tone="pass">Pass</Pill>
      ) : (
        <Pill tone="crit">{recheck}</Pill>
      );
  }
}
