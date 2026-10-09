// Deterministic sample Google data for local development and tests (provider "demo").
// Only offered when FIXTURE_SITES=true; always labelled "demo data" in the UI.
import { createHash } from "node:crypto";
import type { Ga4Api, GscApi, GscSitemap, Inspection, QueryRow, SearchRow } from "./types";

const h = (s: string): number => createHash("sha256").update(s).digest().readUInt32BE(0);

function coverageFor(url: string): Pick<Inspection, "verdict" | "coverageState" | "indexingState"> {
  if (/old-post|gone/.test(url))
    return { verdict: "FAIL", coverageState: "Not found (404)", indexingState: "INDEXING_ALLOWED" };
  const n = h(url) % 13;
  if (n === 0)
    return {
      verdict: "NEUTRAL",
      coverageState: "Crawled - currently not indexed",
      indexingState: "INDEXING_ALLOWED",
    };
  if (n === 1)
    return {
      verdict: "NEUTRAL",
      coverageState: "Discovered - currently not indexed",
      indexingState: "INDEXING_ALLOWED",
    };
  return {
    verdict: "PASS",
    coverageState: "Submitted and indexed",
    indexingState: "INDEXING_ALLOWED",
  };
}

/** Sample queries per page path; some queries deliberately appear on two pages (cannibalization). */
const DEMO_QUERIES: Record<string, string[]> = {
  "/": ["handmade ceramic mugs", "ceramic mugs", "example store"],
  "/about/": ["handmade pottery studio", "example store"],
  "/services/": [
    "custom mug orders",
    "pottery workshop",
    "personalised mugs",
    "personalised name mugs",
  ],
  "/pricing/": ["custom mug price"],
  "/collections/mugs/": ["ceramic mugs", "buy coffee mugs online", "gift mugs"],
  "/products/gift-set/": ["gift mugs", "mug gift set"],
  "/blog/care-guide/": ["how to clean ceramic mugs", "ceramic mug care"],
};
const DEMO_COUNTRIES: [string, number][] = [
  ["lka", 1],
  ["gbr", 0.3],
  ["usa", 0.2],
];

function demoQueriesFor(page: string): string[] {
  const path = new URL(page).pathname;
  const known = DEMO_QUERIES[path];
  if (known) return known;
  const slug = path.split("/").filter(Boolean).at(-1);
  if (!slug) return [];
  const topic = slug.replace(/-/g, " ");
  return path.startsWith("/products/") ? [topic, `buy ${topic}`] : [topic];
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
    return [
      { siteUrl: `sc-domain:${new URL(this.origin).hostname}`, permissionLevel: "siteOwner" },
    ];
  }

  async searchAnalytics(): Promise<SearchRow[]> {
    return (await this.pages())
      .map((page) => {
        const impressions = 200 + (h(`i${page}`) % 4800);
        const clicks = Math.round(impressions * ((h(`c${page}`) % 60) / 1000));
        return {
          page,
          clicks,
          impressions,
          ctr: impressions ? clicks / impressions : 0,
          position: 3 + (h(`p${page}`) % 250) / 10,
        };
      })
      .sort((a, b) => b.clicks - a.clicks || a.page.localeCompare(b.page));
  }

  async queryAnalytics(): Promise<QueryRow[]> {
    const rows: QueryRow[] = [];
    for (const page of await this.pages()) {
      for (const [rank, query] of demoQueriesFor(page).entries()) {
        // One position per query and page (countries differ only in volume).
        // "personalised" queries rank beyond page 2: the demo content gap.
        const offset = query.startsWith("personalised") ? 30 : 2;
        const position = Math.round((offset + (h(`qp${query}|${page}`) % 190) / 10) * 10) / 10;
        for (const [country, share] of DEMO_COUNTRIES) {
          const base = 60 + (h(`qi${query}|${page}`) % 1400);
          const impressions = Math.round((base * share) / (rank + 1));
          if (impressions === 0) continue;
          const ctr = position <= 3 ? 0.18 : position <= 10 ? 0.04 : 0.008;
          rows.push({
            query,
            page,
            country,
            clicks: Math.round(impressions * ctr),
            impressions,
            position,
          });
        }
      }
    }
    return rows.sort(
      (a, b) =>
        a.query.localeCompare(b.query) ||
        a.page.localeCompare(b.page) ||
        a.country.localeCompare(b.country),
    );
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
    return {
      url,
      ...c,
      robotsTxtState: "ALLOWED",
      lastCrawlTime: "2026-09-20T03:00:00Z",
      googleCanonical: url,
      raw: { demo: true, ...c },
    };
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
