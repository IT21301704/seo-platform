import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui";
import { requireProject, requireUser } from "@/lib/session";
import { hostOf } from "@/lib/utils";

const SECTIONS: Record<string, { title: string; phase: number; what: string }> = {
  copilot: {
    title: "AI Copilot",
    phase: 4,
    what: "Ask questions about your audits, with cited checks and data sources.",
  },
  authority: {
    title: "Authority (off-page)",
    phase: 4,
    what: "Referring domains and profile consistency. Not part of the Health Score.",
  },
  billing: { title: "Plans & billing", phase: 4, what: "Plans, usage meters and invoices." },
};

export default async function ComingSoonPage({
  params,
}: {
  params: Promise<{ id: string; section: string }>;
}) {
  const { id, section } = await params;
  const info = SECTIONS[section];
  if (!info) notFound();
  const { db } = await requireUser();
  const project = await requireProject(db, id);
  return (
    <>
      <PageHeader eyebrow={hostOf(project.rootUrl)} title={info.title} />
      <PageBody>
        <EmptyState title={`Coming in Phase ${info.phase}`}>
          <p className="m-0 text-muted">{info.what}</p>
        </EmptyState>
      </PageBody>
    </>
  );
}
