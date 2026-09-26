// Deterministic sample Google data for local development and tests (provider "demo").
// Only offered when FIXTURE_SITES=true; always labelled "demo data" in the UI.
import { createHash } from "node:crypto";
import type { Ga4Api, GscApi, GscSitemap, Inspection, SearchRow } from "./types";

const h = (s: string): number => createHash("sha256").update(s).digest().readUInt32BE(0);

function coverageFor(url: string): Pick<Inspection, "verdict" | "coverageState" | "indexingState"> {
  if (/old-post|gone/.test(url)) return { verdict: "FAIL", coverageState: "Not found (404)", indexingState: "INDEXING_ALLOWED" };
  const n = h(url) % 13;
  if (n === 0) return { verdict: "NEUTRAL", coverageState: "Crawled - currently not indexed", indexingState: "INDEXING_ALLOWED" };
  if (n === 1) return { verdict: "NEUTRAL", coverageState: "Discovered - currently not indexed", indexingState: "INDEXING_ALLOWED" };
  return { verdict: "PASS", coverageState: "Submitted and indexed", indexingState: "INDEXING_ALLOWED" };
}

/** Demo Search Console for `origin`: sitemaps, clicks and index states derived from the URL list. */
export class DemoGscApi implements GscApi {
  constructor(
    private readonly origin: string,
    private readonly pages: () => Promise<string[]>,
    private readonly sitemapUrls: () => Promise<string[]>,
    private readonly now: () => Date,
  ) {}

  async listSites() {
    return [{ siteUrl: `sc-domain:${new URL(this.origin).hostname}`, permissionLevel: "siteOwner" }];
  }

  async searchAnalytics(): Promise<SearchRow[]> {
    return (await this.pages())
      .map((page) => {
        const impressions = 200 + (h(`i${page}`) % 4800);
        const clicks = Math.round(impressions * ((h(`c${page}`) % 60) / 1000));
        return { page, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: 3 + (h(`p${page}`) % 250) / 10 };
      })
      .sort((a, b) => b.clicks - a.clicks || a.page.localeCompare(b.page));
  }

  async listSitemaps(): Promise<GscSitemap[]> {
    const downloaded = new Date(this.now().getTime() - 86_400_000).toISOString();
    return (await this.sitemapUrls()).map((path) => ({
      path,
      lastSubmitted: "2026-09-01T02:00:00.000Z",
      lastDownloaded: downloaded,
      isPending: false,
      isSitemapsIndex: /index/.test(path),
      errors: 0,
      warnings: 0,
      submitted: null,
      indexed: null,
    }));
  }

  async inspect(_siteUrl: string, url: string): Promise<Inspection> {
    const c = coverageFor(url);
    return { url, ...c, robotsTxtState: "ALLOWED", lastCrawlTime: "2026-09-20T03:00:00Z", googleCanonical: url, raw: { demo: true, ...c } };
  }
}

export class DemoGa4Api implements Ga4Api {
  constructor(private readonly pages: () => Promise<string[]>) {}

  async listProperties() {
    return [{ id: "properties/000000000", name: "Demo account › example-store.com (demo)" }];
  }

  async sessionsByPage() {
    return (await this.pages())
      .map((url) => ({ path: new URL(url).pathname, sessions: 50 + (h(`s${url}`) % 2400) }))
      .sort((a, b) => b.sessions - a.sessions || a.path.localeCompare(b.path));
  }
}
