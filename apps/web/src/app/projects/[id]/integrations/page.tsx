import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { GoogleConnections } from "@/components/google-connections";
import { PageBody, PageHeader } from "@/components/page-header";
import { ButtonLink, Card, Pill } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDate, hostOf } from "@/lib/utils";
import { requestIntegration } from "./actions";

function IntegrationCard({
  name,
  status,
  tone,
  what,
  action,
  dashed,
}: {
  name: string;
  status?: string;
  tone?: Tone;
  what: string;
  action: ReactNode;
  dashed?: boolean;
}) {
  return (
    <Card
      className={`flex min-h-36 flex-col gap-2 p-4 ${dashed ? "border-dashed" : ""}`}
      aria-label={name}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 text-base font-semibold">{name}</h3>
        {status && <Pill tone={tone ?? "gray"}>{status}</Pill>}
      </div>
      <p className="m-0 flex-1 text-sm text-muted">{what}</p>
      <div className="mt-auto">{action}</div>
    </Card>
  );
}

const wide = "w-full justify-center";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-caps m-0">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function NotifyMe({ projectId, tool }: { projectId: string; tool: string }) {
  return (
    <ActionForm
      action={requestIntegration.bind(null, projectId)}
      submitLabel="Notify me"
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="tool" value={tool} />
    </ActionForm>
  );
}

export default async function IntegrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const [integrations, channels] = await Promise.all([
    db.integration.findMany({ where: { projectId: project.id } }),
    db.alertChannel.findMany({ where: { projectId: project.id } }),
  ]);
  const gsc = integrations.find((i) => i.type === "gsc");
  const ga4 = integrations.find((i) => i.type === "ga4");
  const wp = integrations.find((i) => i.type === "wordpress");
  const slack = channels.find((c) => c.type === "slack" && c.enabled);
  const psi = Boolean(process.env["PSI_API_KEY"]);
  const p = `/projects/${project.id}`;
  const google = (i: typeof gsc) =>
    i?.status === "connected"
      ? { status: i.provider === "demo" ? "Demo data" : "Connected", tone: "pass" as const }
      : i?.status === "needs_property"
        ? { status: "Finish setup", tone: "med" as const }
        : { status: "Not connected", tone: "gray" as const };

  return (
    <>
      <PageHeader
        eyebrow={hostOf(project.rootUrl)}
        title="Integrations"
        actions={
          project.verifiedAt ? (
            <Pill tone="pass">Domain verified · {formatDate(project.verifiedAt)}</Pill>
          ) : (
            <Pill tone="med">Domain not verified</Pill>
          )
        }
      />
      <PageBody>
        <Section title="Google">
          <IntegrationCard
            name="Search Console"
            {...google(gsc)}
            what="Indexing, queries, clicks, links"
            action={
              <ButtonLink href="#google-data" variant="secondary" className={wide}>
                Manage
              </ButtonLink>
            }
          />
          <IntegrationCard
            name="Analytics 4"
            {...google(ga4)}
            what="Traffic per page to rank impact"
            action={
              <ButtonLink href="#google-data" variant="secondary" className={wide}>
                Manage
              </ButtonLink>
            }
          />
          <IntegrationCard
            name="PageSpeed / CrUX"
            status={psi ? "Active" : "Not set"}
            tone={psi ? "pass" : "gray"}
            what={
              psi
                ? "Real-user Core Web Vitals"
                : "Real-user Core Web Vitals · set PSI_API_KEY on the server"
            }
            action={
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-primary">Details</summary>
                <p className="m-0 mt-1 text-muted">
                  Field data from the Chrome UX Report (28-day rolling) is preferred over lab runs.
                  Scores use bands, not raw milliseconds.
                </p>
              </details>
            }
          />
          <IntegrationCard
            name="Need another?"
            what="Tell us which tool you use"
            dashed
            action={
              <ActionForm
                action={requestIntegration.bind(null, project.id)}
                submitLabel="Request"
                className="flex flex-col gap-2"
              >
                <label className="sr-only" htmlFor="request-tool">
                  Tool name
                </label>
                <input
                  id="request-tool"
                  name="tool"
                  placeholder="e.g. Bing Webmaster Tools"
                  className="h-9 rounded-lg border border-[#CFCFC8] px-2 text-sm"
                />
              </ActionForm>
            }
          />
        </Section>

        <Section title="Website platforms · used to publish fixes">
          <IntegrationCard
            name="WordPress"
            status={
              wp?.status === "connected"
                ? "Connected"
                : wp?.status === "error"
                  ? "Needs attention"
                  : wp
                    ? "Waiting for plugin"
                    : "Not connected"
            }
            tone={
              wp?.status === "connected"
                ? "pass"
                : wp?.status === "error"
                  ? "crit"
                  : wp
                    ? "med"
                    : "gray"
            }
            what={
              wp?.status === "connected"
                ? (wp.externalName ?? "Plugin connected")
                : "Companion plugin; Yoast SEO and Rank Math supported"
            }
            action={
              <ButtonLink href={`${p}/integrations/wordpress`} variant="secondary" className={wide}>
                {wp ? "Manage" : "Connect"}
              </ButtonLink>
            }
          />
          <IntegrationCard
            name="Shopify"
            status="Coming soon"
            what="Products, pages, meta fields"
            action={<NotifyMe projectId={project.id} tool="Shopify" />}
          />
          <IntegrationCard
            name="Webflow"
            status="Coming soon"
            what="CMS items, page SEO fields"
            action={<NotifyMe projectId={project.id} tool="Webflow" />}
          />
          <IntegrationCard
            name="GitHub / GitLab"
            status="Coming soon"
            what="Custom sites · fixes as pull requests"
            action={<NotifyMe projectId={project.id} tool="GitHub / GitLab" />}
          />
        </Section>

        <Section title="Data and alerts">
          <IntegrationCard
            name="Backlink data"
            status="Not set"
            what="Powers the Authority page (Phase 4)"
            action={<NotifyMe projectId={project.id} tool="Backlink data" />}
          />
          <IntegrationCard
            name="Slack"
            status={slack ? "Connected" : "Not set"}
            tone={slack ? "pass" : "gray"}
            what={slack ? `Alerts to ${slack.target}` : "Alerts to a Slack channel"}
            action={
              <ButtonLink href={`${p}/monitoring`} variant="secondary" className={wide}>
                {slack ? "Manage" : "Connect"}
              </ButtonLink>
            }
          />
          <IntegrationCard
            name="WhatsApp"
            status="Coming soon"
            what="Critical alerts to your phone"
            action={<NotifyMe projectId={project.id} tool="WhatsApp" />}
          />
          <IntegrationCard
            name="Cloudflare"
            status="Coming soon"
            what="Redirects and headers at the edge"
            action={<NotifyMe projectId={project.id} tool="Cloudflare" />}
          />
        </Section>

        <div id="google-data" className="max-w-3xl">
          <GoogleConnections
            projectId={project.id}
            integrations={integrations.filter((i) => i.type !== "wordpress")}
            editable={canEdit(user.role)}
            back="integrations"
          />
        </div>

        <p className="m-0 flex items-center gap-3 rounded-[10px] border border-[#C9D3F5] bg-primary-soft p-4 text-sm">
          <span aria-hidden="true">🔒</span>
          Access tokens are encrypted. We ask for the smallest permissions needed, and you can
          disconnect at any time. <Link href={`${p}/api`}>API &amp; webhooks</Link>
        </p>
      </PageBody>
    </>
  );
}
