import { WEBHOOK_EVENTS } from "@seo/worker/webhooks";
import { PageBody, PageHeader } from "@/components/page-header";
import { SecretForm } from "@/components/secret-form";
import { Card, CardLabel, Mono, Pill, Table, Td, Th } from "@/components/ui";
import { API_SCOPES, RATE_LIMIT_PER_MINUTE } from "@/lib/api";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDateTime, hostOf } from "@/lib/utils";
import { createApiKey, createWebhook, deleteWebhook, revokeApiKey } from "./actions";

const input = "h-10 rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm";
const small = "h-8 rounded-lg border border-[#CFCFC8] bg-white px-3 text-[13px] font-semibold";

const ENDPOINTS = [
  ["POST", "/v1/projects/{projectId}/sitemap-checks", "Start a check (async) → checkId"],
  ["GET", "/v1/sitemap-checks/{checkId}", "Status, score, counts, versions"],
  ["GET", "/v1/sitemap-checks/{checkId}/issues", "Failing checks; ?severity=&rule=&status=&page="],
  ["GET", "/v1/sitemap-checks/{checkId}/urls", "Every sitemap URL with status, indexability, GSC state"],
  ["GET", "/v1/sitemap-checks/{checkId}/manual-urls?format=csv|json|xml", "URLs to add by hand"],
  ["GET", "/v1/sitemap-checks/{checkId}/remove-urls", "URLs to remove"],
  ["POST", "/v1/sitemap-checks/{checkId}/fixes", "Auto-fix batches (Phase 3; returns 501 today)"],
];

export default async function ApiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const editable = canEdit(user.role);
  const [keys, hooks, deliveries] = await Promise.all([
    db.apiKey.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
    db.webhook.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
    db.webhookDelivery.findMany({ where: { webhook: { projectId: project.id } }, orderBy: { createdAt: "desc" }, take: 10, include: { webhook: { select: { url: true } } } }),
  ]);

  return (
    <>
      <PageHeader eyebrow={hostOf(project.rootUrl)} title="API & webhooks" />
      <PageBody>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card className="flex flex-col gap-4 p-5">
            <CardLabel>API keys</CardLabel>
            <p className="m-0 text-sm text-muted">
              Send <Mono>Authorization: Bearer &lt;key&gt;</Mono>. Keys only see this project. Limit: {RATE_LIMIT_PER_MINUTE} requests per minute per key. Project ID:{" "}
              <Mono>{project.id}</Mono>
            </p>
            {keys.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Key</Th>
                    <Th>Scopes</Th>
                    <Th>Last used</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <Td>{k.name}</Td>
                      <Td>
                        <Mono>{k.prefix}…</Mono>
                      </Td>
                      <Td className="text-xs">{k.scopes.join(", ")}</Td>
                      <Td className="text-xs text-muted">{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "Never"}</Td>
                      <Td>
                        {k.revokedAt ? (
                          <Pill tone="gray">Revoked</Pill>
                        ) : (
                          editable && (
                            <form action={revokeApiKey.bind(null, project.id, k.id)}>
                              <button type="submit" className={small}>
                                Revoke
                              </button>
                            </form>
                          )
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {editable && (
              <SecretForm action={createApiKey.bind(null, project.id)} submitLabel="Create API key">
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Name
                  <input name="name" required placeholder="CI pipeline" className={input} />
                </label>
                <fieldset className="m-0 flex gap-4 border-0 p-0 text-sm">
                  <legend className="mb-1 font-semibold">Scopes</legend>
                  {API_SCOPES.map((s) => (
                    <label key={s} className="flex items-center gap-2">
                      <input type="checkbox" name="scopes" value={s} defaultChecked={s === "sitemap:read"} /> {s}
                    </label>
                  ))}
                </fieldset>
              </SecretForm>
            )}
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <CardLabel>Webhooks</CardLabel>
            <p className="m-0 text-sm text-muted">
              We POST JSON with <Mono>x-seo-signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</Mono>: HMAC-SHA256 of <Mono>&lt;t&gt;.&lt;body&gt;</Mono> with your signing secret.
              Reject timestamps older than 5 minutes. Failed deliveries retry 5 times with backoff.
            </p>
            {hooks.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 border-b border-[#EDEDE8] pb-3 text-sm">
                <Mono className="min-w-0 flex-1 truncate">{h.url}</Mono>
                {h.events.map((e) => (
                  <Pill key={e} tone="info">
                    {e}
                  </Pill>
                ))}
                {editable && (
                  <form action={deleteWebhook.bind(null, project.id, h.id)}>
                    <button type="submit" className={small}>
                      Delete
                    </button>
                  </form>
                )}
              </div>
            ))}
            {editable && (
              <SecretForm action={createWebhook.bind(null, project.id)} submitLabel="Add webhook">
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Endpoint URL (https)
                  <input name="url" type="url" required placeholder="https://example.com/hooks/seo" className={input} />
                </label>
                <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0 text-sm">
                  <legend className="mb-1 font-semibold">Events</legend>
                  {WEBHOOK_EVENTS.map((e) => (
                    <label key={e} className="flex items-center gap-2">
                      <input type="checkbox" name="events" value={e} defaultChecked={e === "sitemap.check.completed"} /> {e}
                    </label>
                  ))}
                </fieldset>
              </SecretForm>
            )}
            {deliveries.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>Event</Th>
                    <Th>Status</Th>
                    <Th>When</Th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <Td className="text-xs">{d.event}</Td>
                      <Td>
                        <Pill tone={d.status === "delivered" ? "pass" : d.status === "failed" ? "crit" : "gray"}>
                          {d.status}
                          {d.responseStatus ? ` · ${d.responseStatus}` : ""}
                        </Pill>
                      </Td>
                      <Td className="text-xs text-muted">{formatDateTime(d.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <Card className="px-2 pb-2 pt-4">
          <CardLabel className="px-3">Sitemap Validation API</CardLabel>
          <Table>
            <tbody>
              {ENDPOINTS.map(([method, path, purpose]) => (
                <tr key={path}>
                  <Td className="w-16">
                    <Pill tone={method === "POST" ? "high" : "info"}>{method}</Pill>
                  </Td>
                  <Td>
                    <Mono className="text-[13px]">{path}</Mono>
                  </Td>
                  <Td className="text-muted">{purpose}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </PageBody>
    </>
  );
}
