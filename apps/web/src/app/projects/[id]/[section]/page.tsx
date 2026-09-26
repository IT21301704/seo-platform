import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui";
import { requireProject, requireUser } from "@/lib/session";
import { hostOf } from "@/lib/utils";

const SECTIONS: Record<string, { title: string; phase: number; what: string }> = {
  sitemap: {
    title: "Sitemap check",
    phase: 2,
    what: "Sitemap score, Google index status and the Sitemap Validation API.",
  },
  "sitemap-urls": {
    title: "Sitemap URL lists",
    phase: 2,
    what: "URLs to add manually and URLs to remove from sitemaps.",
  },
  copilot: {
    title: "AI Copilot",
    phase: 4,
    what: "Ask questions about your audits, with cited checks and data sources.",
  },
  changes: {
    title: "Change log",
    phase: 3,
    what: "Every published fix with before/after values, verification and rollback.",
  },
  keywords: {
    title: "Keyword research",
    phase: 3,
    what: "Keyword ideas, clusters, keyword-to-page map and quick wins.",
  },
  monitoring: {
    title: "Monitoring",
    phase: 2,
    what: "Scheduled audits, score history and alerts by email and Slack.",
  },
  authority: {
    title: "Authority (off-page)",
    phase: 4,
    what: "Referring domains and profile consistency. Not part of the Health Score.",
  },
  integrations: {
    title: "Integrations",
    phase: 3,
    what: "Search Console, GA4, PageSpeed/CrUX and the WordPress plugin.",
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
