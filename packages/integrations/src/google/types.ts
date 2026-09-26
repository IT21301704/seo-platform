/** Search Console search analytics row, by page. */
export interface SearchRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSitemap {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  isSitemapsIndex: boolean;
  errors: number;
  warnings: number;
  submitted: number | null;
  indexed: number | null;
}

export interface Inspection {
  url: string;
  /** PASS / PARTIAL / FAIL / NEUTRAL */
  verdict: string;
  /** e.g. "Submitted and indexed", "Crawled - currently not indexed" */
  coverageState: string;
  indexingState: string | null;
  robotsTxtState: string | null;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  raw: unknown;
}

export interface GscApi {
  listSites(): Promise<{ siteUrl: string; permissionLevel: string }[]>;
  searchAnalytics(
    siteUrl: string,
    range: { startDate: string; endDate: string },
  ): Promise<SearchRow[]>;
  listSitemaps(siteUrl: string): Promise<GscSitemap[]>;
  inspect(siteUrl: string, url: string): Promise<Inspection>;
}

export interface Ga4Api {
  listProperties(): Promise<{ id: string; name: string }[]>;
  sessionsByPage(
    propertyId: string,
    range: { startDate: string; endDate: string },
  ): Promise<{ path: string; sessions: number }[]>;
}

export type Band = "good" | "needs-improvement" | "poor";

export interface CruxMetrics {
  lcp: { p75: number; band: Band } | null;
  inp: { p75: number; band: Band } | null;
  cls: { p75: number; band: Band } | null;
}

/** An inspection counts as indexed only when Google says so (verdict PASS). */
export const isIndexed = (i: Pick<Inspection, "verdict" | "coverageState">): boolean =>
  i.verdict === "PASS" || /^submitted and indexed$|^indexed/i.test(i.coverageState);
