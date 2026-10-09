import Link from "next/link";
import type { Prisma } from "@seo/db";
import { FIX_KINDS } from "@seo/fixes";
import type { FixKind } from "@seo/fixes";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionButton } from "@/components/fix-forms";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, EmptyState, Mono, Pill, Table, Td, Th } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { batchLabel, displayValue } from "@/lib/fixes";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDateTime, formatTime, pathOf, plural } from "@/lib/utils";
import { reapplyBatch, rollbackBatch, rollbackFix } from "../fixes/actions";

const SOURCES = { all: "AI and user", ai: "AI", user: "User" } as const;
const STATUSES = {
  all: "All",
  verified: "Verified",
  rechecking: "Re-checking",
  verify_failed: "Verify failed",
  rolled_back: "Rolled back",
} as const;

const select = "h-10 rounded-lg border border-[#CFCFC8] bg-white px-2 text-sm";

export default async function ChangeLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string; status?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const source = (sp.source && sp.source in SOURCES ? sp.source : "all") as keyof typeof SOURCES;
  const status = (sp.status && sp.status in STATUSES ? sp.status : "all") as keyof typeof STATUSES;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);

  const where: Prisma.FixBatchWhereInput = {
    projectId: project.id,
    publishedAt: { not: null },
    ...(source === "all" ? {} : { source }),
    ...(status === "all"
      ? {}
      : status === "rechecking"
        ? { state: { in: ["rechecking", "verifying", "publishing"] } }
        : { state: status }),
  };
  const batches = await db.fixBatch.findMany({
    where,
    orderBy: { publishedAt: "desc" },
    take: 50,
    include: { fixes: { where: { state: { not: "draft" } }, orderBy: { url: "asc" } } },
  });
  const userIds = [
    ...new Set(batches.flatMap((b) => [b.approvedById, b.rolledBackById]).filter(Boolean)),
  ] as string[];
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const nameOf = (uid: string | null) => {
    const u = users.find((x) => x.id === uid);
    return u ? (u.name ?? u.email) : "a team member";
  };
  const editor = canEdit(user.role);
  const busy = batches.some((b) => ["publishing", "verifying"].includes(b.state));

  return (
    <>
      <AutoRefresh active={busy} everyMs={4000} />
      <PageHeader
        eyebrow="Every change, who approved it, and how to undo it"
        title="Change log"
        actions={
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Source
              <select name="source" defaultValue={source} className={select}>
                {Object.entries(SOURCES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Status
              <select name="status" defaultValue={status} className={select}>
                {Object.entries(STATUSES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="h-10 rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm font-semibold"
            >
              Filter
            </button>
          </form>
        }
      />
      <PageBody>
        {batches.length === 0 ? (
          <EmptyState title="No published changes yet">
            Approved fixes appear here with their old and new values.{" "}
            <Link href={`/projects/${project.id}/fixes`}>Review auto-fixes</Link>
          </EmptyState>
        ) : (
          batches.map((b) => {
            const def = FIX_KINDS[b.kind as FixKind];
            const pages = new Set(b.fixes.map((f) => f.url)).size;
            const published = b.fixes.filter((f) => f.appliedAt !== null);
            const verified = b.fixes.filter((f) => f.state === "verified").length;
            const live = b.fixes.filter((f) => ["applied", "verified"].includes(f.state));
            const single = pages === 1 && b.fixes[0];
            const failedFix = b.fixes.find((f) => f.state === "verify_failed");
            const pill = statePill(b.state, verified, published.length, b.nextVerifyAt);
            return (
              <Card
                key={b.id}
                className={`flex flex-col gap-3 p-5 ${b.state === "verified" ? "border-[#B9DEC4]" : ""}`}
                aria-label={`Batch ${batchLabel(b.number)}`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="m-0 text-base font-semibold">
                      {def?.changeTitle ?? b.kind} ·{" "}
                      {single ? <Mono>{pathOf(single.url)}</Mono> : plural(pages, "page")}
                    </h2>
                    <p className="m-0 text-sm text-muted">
                      {b.source === "ai" ? "AI draft" : "User change"} · approved by{" "}
                      {nameOf(b.approvedById)} · published{" "}
                      {b.publishedAt ? formatDateTime(b.publishedAt) : "—"}
                      {b.risk === "high" ? " · high risk, approved individually" : ""}
                      {b.state === "rolled_back" && b.rolledBackAt
                        ? ` · rolled back by ${nameOf(b.rolledBackById)} on ${formatDateTime(b.rolledBackAt)}`
                        : ""}{" "}
                      · batch #{batchLabel(b.number)} ·{" "}
                      <Link href={`/projects/${project.id}/fixes/${b.id}`}>details</Link>
                    </p>
                  </div>
                  <Pill tone={pill.tone}>{pill.label}</Pill>
                  {editor && live.length > 0 && (
                    <ActionButton
                      action={rollbackBatch.bind(null, project.id, b.id)}
                      confirm={`Roll back ${plural(live.length, "change")}? The saved old values are restored.`}
                    >
                      {live.length === 1 ? "Roll back" : "Roll back batch"}
                    </ActionButton>
                  )}
                  {editor &&
                    ["rolled_back", "verify_failed"].includes(b.state) &&
                    live.length === 0 && (
                      <ActionButton action={reapplyBatch.bind(null, project.id, b.id)}>
                        Re-apply
                      </ActionButton>
                    )}
                </div>
                {b.state === "verify_failed" && failedFix && (
                  <p className="m-0 rounded-lg bg-crit-bg p-3 text-sm text-crit">
                    Why:{" "}
                    {String(
                      (failedFix.verification as { reason?: string } | null)?.reason ??
                        "the check still failed on the live page",
                    )}
                    . The old value was restored automatically.
                  </p>
                )}
                <details open={b.fixes.length <= 3}>
                  <summary className="cursor-pointer text-sm font-semibold text-primary">
                    Old and new values ({b.fixes.length})
                  </summary>
                  <div className="mt-2 overflow-x-auto">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Page</Th>
                          <Th>Old value</Th>
                          <Th>New value</Th>
                          <Th>Verified</Th>
                          <Th>
                            <span className="sr-only">Undo</span>
                          </Th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.fixes.map((f) => (
                          <tr key={f.id}>
                            <Td>
                              <Mono className="break-all">{pathOf(f.url)}</Mono>
                            </Td>
                            <Td className="max-w-60 truncate text-muted">
                              {f.kind === "link"
                                ? pathOf(String(f.currentValue))
                                : displayValue(f.kind, f.oldValue) || <em>empty</em>}
                            </Td>
                            <Td className="max-w-80 truncate">
                              {displayValue(f.kind, f.newValue)}
                            </Td>
                            <Td>
                              <FixPill state={f.state} error={f.error} />
                            </Td>
                            <Td>
                              {editor &&
                                ["applied", "verified"].includes(f.state) &&
                                b.fixes.length > 1 && (
                                  <ActionButton
                                    action={rollbackFix.bind(null, project.id, b.id, f.id)}
                                    variant="link"
                                  >
                                    Undo
                                  </ActionButton>
                                )}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </details>
              </Card>
            );
          })
        )}
        <p className="m-0 text-sm text-muted">
          Each entry stores: who, what, when, page, old value, new value, source (AI or user),
          verification result.
        </p>
      </PageBody>
    </>
  );
}

function statePill(
  state: string,
  verified: number,
  total: number,
  next: Date | null,
): { label: string; tone: Tone } {
  switch (state) {
    case "verified":
      return { label: `Verified ${verified} / ${total}`, tone: "pass" };
    case "rechecking":
      return {
        label: `Re-checking · CDN cache${next ? `, next try ${formatTime(next)}` : ""}`,
        tone: "med",
      };
    case "verifying":
    case "publishing":
      return { label: "Publishing and verifying…", tone: "info" };
    case "verify_failed":
      return { label: "Verify failed · rolled back automatically", tone: "crit" };
    case "rolled_back":
      return { label: "Rolled back", tone: "gray" };
    default:
      return { label: "Failed", tone: "crit" };
  }
}

function FixPill({ state, error }: { state: string; error: string | null }) {
  switch (state) {
    case "verified":
      return <Pill tone="pass">Before ✗ → After ✓</Pill>;
    case "applied":
      return <Pill tone="med">Checking</Pill>;
    case "verify_failed":
      return <Pill tone="crit">Failed · rolled back</Pill>;
    case "rolled_back":
      return <Pill tone="gray">Rolled back</Pill>;
    case "failed":
      return <Pill tone="crit">{error ? "Not published" : "Failed"}</Pill>;
    default:
      return <Pill tone="gray">{state}</Pill>;
  }
}
