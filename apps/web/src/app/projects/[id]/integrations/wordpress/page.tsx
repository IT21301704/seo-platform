import Link from "next/link";
import type { WpStatus } from "@seo/integrations";
import { ActionForm } from "@/components/action-form";
import { PageBody, PageHeader } from "@/components/page-header";
import { SecretForm } from "@/components/secret-form";
import { Button, Card, CardLabel, Mono, Pill } from "@/components/ui";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDateTime, hostOf } from "@/lib/utils";
import { checkWordPress, createWordPressKey, disconnectWordPress } from "../actions";

const SEO_NAME = {
  yoast: "Yoast SEO",
  rankmath: "Rank Math",
  core: "None (the plugin outputs titles and descriptions)",
};
const SITEMAP_NAME = {
  core: "WordPress core",
  yoast: "Yoast SEO",
  rankmath: "Rank Math",
  none: "None",
};

export default async function WordPressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const wp = await db.integration.findFirst({
    where: { projectId: project.id, type: "wordpress" },
  });
  const status = (wp?.details ?? {}) as Partial<WpStatus>;
  const editor = canEdit(user.role);
  const p = `/projects/${project.id}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={`${p}/integrations`}>Integrations</Link> / {hostOf(project.rootUrl)}
          </>
        }
        title="WordPress"
        actions={
          wp?.status === "connected" ? (
            <Pill tone="pass">Connected</Pill>
          ) : wp?.status === "error" ? (
            <Pill tone="crit">Needs attention</Pill>
          ) : (
            <Pill tone="gray">Not connected</Pill>
          )
        }
      />
      <PageBody>
        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-5">
            <Card className="flex flex-col gap-4 p-5">
              <CardLabel>Connect in four steps</CardLabel>
              <ol className="m-0 flex flex-col gap-4 pl-5 text-sm leading-relaxed">
                <li>
                  <a href={`${p}/integrations/wordpress/plugin.zip`} className="font-semibold">
                    Download the plugin (seo-platform.zip)
                  </a>
                </li>
                <li>
                  In WordPress go to <strong>Plugins → Add New → Upload Plugin</strong>, upload the
                  file and press <strong>Activate</strong>.
                </li>
                <li>
                  Create a connection key, then paste it in <strong>Settings → SEO Platform</strong>{" "}
                  and press Connect.
                  {editor && (
                    <div className="mt-3">
                      <SecretForm
                        action={createWordPressKey.bind(null, project.id)}
                        submitLabel={
                          wp ? "Create a new key (replaces the old one)" : "Create connection key"
                        }
                      >
                        <span className="sr-only">Connection key</span>
                      </SecretForm>
                    </div>
                  )}
                </li>
                <li>
                  Check the connection. A signed request goes to the plugin; when it answers from{" "}
                  <Mono>{hostOf(project.rootUrl)}</Mono>, your domain counts as verified.
                  {editor && wp && (
                    <div className="mt-3">
                      <ActionForm
                        action={checkWordPress.bind(null, project.id)}
                        submitLabel="Check connection"
                      >
                        <span className="sr-only">Check the WordPress connection</span>
                      </ActionForm>
                    </div>
                  )}
                </li>
              </ol>
            </Card>

            <Card className="flex flex-col gap-2 p-5 text-sm leading-relaxed">
              <CardLabel>What the plugin can change</CardLabel>
              <p className="m-0">
                Titles and meta descriptions (in Yoast SEO, Rank Math, or its own fields when
                neither is installed), image alt text in the media library, noindex, canonical URLs,
                redirects, sitemap exclusions, extra lines in the virtual robots.txt, and links
                inside page content.
              </p>
              <p className="m-0 text-muted">
                It changes nothing on its own: only changes you approve on the Auto-fix review
                screen. It saves the old value first so every change can be rolled back from the{" "}
                <Link href={`${p}/changes`}>Change log</Link>, and refuses a change when the value
                on the site was edited in the meantime. It also tells SEO Platform when a page is
                updated or deleted, so we re-check it (at most every 10 minutes). All requests in
                both directions are signed (HMAC-SHA256) and expire after 5 minutes.
              </p>
            </Card>
          </div>

          <Card className="flex h-fit flex-col gap-3 p-5 text-sm">
            <CardLabel>Status</CardLabel>
            {!wp ? (
              <p className="m-0 text-muted">No connection key yet.</p>
            ) : (
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="text-muted">Plugin</dt>
                <dd className="m-0">
                  {status.pluginVersion
                    ? `v${status.pluginVersion}`
                    : "Waiting for the first check"}
                </dd>
                <dt className="text-muted">WordPress</dt>
                <dd className="m-0">{status.wpVersion ?? "—"}</dd>
                <dt className="text-muted">SEO plugin</dt>
                <dd className="m-0">
                  {status.seoPlugin
                    ? `${SEO_NAME[status.seoPlugin]}${status.seoPluginVersion ? ` ${status.seoPluginVersion}` : ""}`
                    : "—"}
                </dd>
                <dt className="text-muted">Sitemap</dt>
                <dd className="m-0">{status.sitemap ? SITEMAP_NAME[status.sitemap] : "—"}</dd>
                <dt className="text-muted">Last check</dt>
                <dd className="m-0">{wp.lastSyncAt ? formatDateTime(wp.lastSyncAt) : "—"}</dd>
              </dl>
            )}
            {status.physicalRobotsTxt && (
              <p className="m-0 rounded-lg bg-med-bg p-3 text-med">
                A robots.txt file on the server overrides WordPress, so robots.txt fixes cannot be
                published. Edit that file instead.
              </p>
            )}
            {wp?.error && <p className="m-0 rounded-lg bg-crit-bg p-3 text-crit">{wp.error}</p>}
            {editor && wp && (
              <form action={disconnectWordPress.bind(null, project.id)}>
                <Button type="submit" variant="secondary" size="sm">
                  Disconnect
                </Button>
              </form>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
