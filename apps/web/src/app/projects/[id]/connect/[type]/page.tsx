import { notFound } from "next/navigation";
import { ga4ApiFor, gscApiFor } from "@seo/worker/google";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button, Card, EmptyState } from "@/components/ui";
import { GOOGLE_LABEL, googleHttp, isGoogleType } from "@/lib/google";
import { requireProject, requireUser } from "@/lib/session";
import { hostOf } from "@/lib/utils";
import { selectProperty } from "../actions";

/** After Google consent: pick which Search Console / GA4 property belongs to this project. */
export default async function ConnectPage({ params, searchParams }: { params: Promise<{ id: string; type: string }>; searchParams: Promise<{ back?: string }> }) {
  const { id, type } = await params;
  const { back = "sitemap" } = await searchParams;
  if (!isGoogleType(type)) notFound();
  const { db } = await requireUser();
  const project = await requireProject(db, id);
  const integration = await db.integration.findUnique({ where: { projectId_type: { projectId: project.id, type } } });
  if (!integration) notFound();

  let options: { id: string; name: string }[] = [];
  let error: string | null = null;
  try {
    options =
      type === "gsc"
        ? (await gscApiFor(db, googleHttp(), integration, project.rootUrl, () => new Date()).listSites()).map((s) => ({ id: s.siteUrl, name: s.siteUrl }))
        : await ga4ApiFor(db, googleHttp(), integration, () => new Date()).listProperties();
  } catch (e) {
    error = (e as Error).message;
  }
  const host = hostOf(project.rootUrl).replace(/^www\./, "");
  const suggested = options.find((o) => o.id === `sc-domain:${host}` || o.id.includes(host))?.id ?? options[0]?.id;
  const select = selectProperty.bind(null, project.id, type, back);

  return (
    <>
      <PageHeader eyebrow={hostOf(project.rootUrl)} title={`Connect ${GOOGLE_LABEL[type]}`} />
      <PageBody>
        {error ? (
          <EmptyState title="Could not list your properties">
            <p className="m-0 text-muted">{error}</p>
          </EmptyState>
        ) : options.length === 0 ? (
          <EmptyState title="No properties found">
            <p className="m-0 text-muted">This Google account has no {type === "gsc" ? "verified Search Console properties" : "GA4 properties"}.</p>
          </EmptyState>
        ) : (
          <Card className="max-w-xl p-6">
            <form action={select} className="flex flex-col gap-4">
              <label htmlFor="property" className="text-sm font-semibold">
                {type === "gsc" ? "Search Console property for this website" : "GA4 property for this website"}
              </label>
              <select id="property" name="property" defaultValue={suggested ? `${suggested}|${options.find((o) => o.id === suggested)?.name}` : undefined} className="h-10 rounded-lg border border-[#CFCFC8] px-3 text-sm">
                {options.map((o) => (
                  <option key={o.id} value={`${o.id}|${o.name}`}>
                    {o.name}
                  </option>
                ))}
              </select>
              <p className="m-0 text-xs text-muted">Read-only access. Data is saved as dated snapshots and refreshed daily at 02:00 site time.</p>
              <Button type="submit" className="self-start">
                Use this property
              </Button>
            </form>
          </Card>
        )}
      </PageBody>
    </>
  );
}
