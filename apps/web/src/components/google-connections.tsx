import type { Integration } from "@seo/db";
import { disconnect, syncNow } from "@/app/projects/[id]/connect/actions";
import { Card, CardLabel, Pill } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

const small =
  "h-8 rounded-lg border border-[#CFCFC8] bg-white px-3 text-[13px] font-semibold text-ink no-underline hover:bg-canvas hover:text-ink inline-flex items-center";

/** Search Console + GA4 connection status with Connect / Sync now / Disconnect (M9). */
export function GoogleConnections({
  projectId,
  integrations,
  editable,
  back,
}: {
  projectId: string;
  integrations: Integration[];
  editable: boolean;
  back: "sitemap" | "monitoring";
}) {
  const rows = [
    {
      type: "gsc" as const,
      name: "Google Search Console",
      what: "Sitemaps, indexing (URL Inspection), queries",
    },
    {
      type: "ga4" as const,
      name: "Google Analytics 4",
      what: "Visits per page, to rank issue impact",
    },
  ];
  const anyConnected = integrations.some((i) => i.status === "connected");
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <CardLabel>Google data</CardLabel>
        {editable && anyConnected && (
          <form action={syncNow.bind(null, projectId)}>
            <button type="submit" className={small}>
              Sync now
            </button>
          </form>
        )}
      </div>
      {rows.map((row) => {
        const i = integrations.find((x) => x.type === row.type);
        return (
          <div
            key={row.type}
            className="flex flex-wrap items-center gap-2 border-b border-[#EDEDE8] pb-3 text-sm last:border-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{row.name}</div>
              <div className="text-xs text-muted">
                {i?.status === "connected"
                  ? `${i.externalName ?? i.externalId} · ${i.lastSyncAt ? `synced ${formatDateTime(i.lastSyncAt)}` : "first sync queued"}`
                  : i?.status === "needs_property"
                    ? "Choose a property to finish connecting"
                    : row.what}
              </div>
              {i?.error && <div className="text-xs text-crit">{i.error}</div>}
            </div>
            {i?.provider === "demo" && <Pill tone="med">Demo data</Pill>}
            {i?.status === "connected" && <Pill tone="pass">Connected</Pill>}
            {editable && !i && (
              <a
                className={small}
                href={`/api/integrations/google/start?projectId=${projectId}&type=${row.type}&back=${back}`}
              >
                Connect
              </a>
            )}
            {editable && i?.status === "needs_property" && (
              <a className={small} href={`/projects/${projectId}/connect/${row.type}?back=${back}`}>
                Choose property
              </a>
            )}
            {editable && i && (
              <form action={disconnect.bind(null, projectId, row.type)}>
                <button type="submit" className={small}>
                  Disconnect
                </button>
              </form>
            )}
          </div>
        );
      })}
      <p className="m-0 text-xs text-muted">
        Read-only access. Tokens are encrypted and never sent to the browser. Data refreshes daily
        at 02:00 site time.
      </p>
    </Card>
  );
}
