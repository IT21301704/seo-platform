import type { JsonHttp } from "../http";
import { ok } from "../http";
import type { Band, CruxMetrics, Ga4Api, GscApi, GscSitemap, Inspection, SearchRow } from "./types";

const WEBMASTERS = "https://www.googleapis.com/webmasters/v3";
const INSPECT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const GA4_DATA = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const CRUX = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const ROW_LIMIT = 25_000;

const num = (v: unknown): number | null =>
  v === undefined || v === null || v === "" ? null : Number(v);

/** Search Console API (Search Analytics, Sitemaps, URL Inspection). */
export class GoogleGscApi implements GscApi {
  constructor(
    private readonly http: JsonHttp,
    private readonly accessToken: () => Promise<string>,
  ) {}

  private async auth(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await this.accessToken()}` };
  }

  async listSites() {
    const body = ok(
      await this.http.send<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>({
        method: "GET",
        url: `${WEBMASTERS}/sites`,
        headers: await this.auth(),
      }),
      "GSC sites",
    );
    return (body.siteEntry ?? [])
      .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
      .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
  }

  async searchAnalytics(
    siteUrl: string,
    range: { startDate: string; endDate: string },
  ): Promise<SearchRow[]> {
    const body = ok(
      await this.http.send<{
        rows?: {
          keys: string[];
          clicks: number;
          impressions: number;
          ctr: number;
          position: number;
        }[];
      }>({
        method: "POST",
        url: `${WEBMASTERS}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        headers: await this.auth(),
        json: { ...range, dimensions: ["page"], rowLimit: ROW_LIMIT, dataState: "final" },
      }),
      "GSC search analytics",
    );
    return (body.rows ?? []).map((r) => ({
      page: r.keys[0] ?? "",
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));
  }

  async listSitemaps(siteUrl: string): Promise<GscSitemap[]> {
    const body = ok(
      await this.http.send<{ sitemap?: Record<string, unknown>[] }>({
        method: "GET",
        url: `${WEBMASTERS}/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
        headers: await this.auth(),
      }),
      "GSC sitemaps",
    );
    return (body.sitemap ?? []).map((s) => {
      const contents =
        (s["contents"] as { submitted?: string; indexed?: string }[] | undefined) ?? [];
      const sum = (key: "submitted" | "indexed") =>
        contents.length ? contents.reduce((n, c) => n + (num(c[key]) ?? 0), 0) : null;
      return {
        path: String(s["path"]),
        lastSubmitted: (s["lastSubmitted"] as string) ?? null,
        lastDownloaded: (s["lastDownloaded"] as string) ?? null,
        isPending: Boolean(s["isPending"]),
        isSitemapsIndex: Boolean(s["isSitemapsIndex"]),
        errors: num(s["errors"]) ?? 0,
        warnings: num(s["warnings"]) ?? 0,
        submitted: sum("submitted"),
        indexed: sum("indexed"),
      };
    });
  }

  async inspect(siteUrl: string, url: string): Promise<Inspection> {
    const body = ok(
      await this.http.send<{ inspectionResult?: { indexStatusResult?: Record<string, unknown> } }>({
        method: "POST",
        url: INSPECT,
        headers: await this.auth(),
        json: { inspectionUrl: url, siteUrl },
      }),
      "URL Inspection",
    );
    const r = body.inspectionResult?.indexStatusResult ?? {};
    return {
      url,
      verdict: String(r["verdict"] ?? "VERDICT_UNSPECIFIED"),
      coverageState: String(r["coverageState"] ?? "Unknown"),
      indexingState: (r["indexingState"] as string) ?? null,
      robotsTxtState: (r["robotsTxtState"] as string) ?? null,
      lastCrawlTime: (r["lastCrawlTime"] as string) ?? null,
      googleCanonical: (r["googleCanonical"] as string) ?? null,
      raw: r,
    };
  }
}

/** GA4 Data + Admin APIs: sessions per page (last 28 days). */
export class GoogleGa4Api implements Ga4Api {
  constructor(
    private readonly http: JsonHttp,
    private readonly accessToken: () => Promise<string>,
  ) {}

  async listProperties() {
    const body = ok(
      await this.http.send<{
        accountSummaries?: {
          displayName: string;
          propertySummaries?: { property: string; displayName: string }[];
        }[];
      }>({
        method: "GET",
        url: `${GA4_ADMIN}/accountSummaries?pageSize=200`,
        headers: { authorization: `Bearer ${await this.accessToken()}` },
      }),
      "GA4 properties",
    );
    return (body.accountSummaries ?? [])
      .flatMap((a) =>
        (a.propertySummaries ?? []).map((p) => ({
          id: p.property,
          name: `${a.displayName} › ${p.displayName}`,
        })),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async sessionsByPage(propertyId: string, range: { startDate: string; endDate: string }) {
    const body = ok(
      await this.http.send<{
        rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
      }>({
        method: "POST",
        url: `${GA4_DATA}/${propertyId}:runReport`,
        headers: { authorization: `Bearer ${await this.accessToken()}` },
        json: {
          dateRanges: [range],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "sessions" }],
          limit: ROW_LIMIT,
        },
      }),
      "GA4 report",
    );
    return (body.rows ?? [])
      .map((r) => ({
        path: r.dimensionValues[0]?.value ?? "/",
        sessions: Number(r.metricValues[0]?.value ?? 0),
      }))
      .sort((a, b) => b.sessions - a.sessions || a.path.localeCompare(b.path));
  }
}

const bandOf = (metric: "lcp" | "inp" | "cls", value: number): Band => {
  const limits = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] }[metric];
  return value <= (limits[0] ?? 0)
    ? "good"
    : value <= (limits[1] ?? 0)
      ? "needs-improvement"
      : "poor";
};

/** CrUX origin-level field data (phone form factor, 28-day rolling p75). */
export async function queryCruxOrigin(
  http: JsonHttp,
  apiKey: string,
  origin: string,
): Promise<CruxMetrics | null> {
  const res = await http.send<{
    record?: { metrics?: Record<string, { percentiles?: { p75?: number | string } }> };
  }>({
    method: "POST",
    url: `${CRUX}?key=${encodeURIComponent(apiKey)}`,
    json: { origin, formFactor: "PHONE" },
  });
  if (res.status === 404) return null; // not enough real-user data
  const metrics = ok(res, "CrUX").record?.metrics ?? {};
  const read = (key: string, metric: "lcp" | "inp" | "cls") => {
    const p75 = num(metrics[key]?.percentiles?.p75);
    return p75 === null ? null : { p75, band: bandOf(metric, p75) };
  };
  return {
    lcp: read("largest_contentful_paint", "lcp"),
    inp: read("interaction_to_next_paint", "inp"),
    cls: read("cumulative_layout_shift", "cls"),
  };
}
