import type { InputType } from "@seo/shared";

// ─── Fetching ───────────────────────────────────────────────────────────────

export interface FetchRequest {
  url: string;
  method?: "GET" | "HEAD";
}

/** One HTTP response. Redirects are NOT followed by fetchers; see fetchWithRedirects. */
export interface FetchResponse {
  url: string;
  status: number;
  /** Lower-cased header names, sorted. */
  headers: Record<string, string>;
  /** Decoded (decompressed) body; empty for HEAD. */
  body: Buffer;
  /** Decoded body size in bytes, or content-length for HEAD. */
  bodySize: number;
}

export type FetchErrorCode = "blocked" | "network" | "timeout" | "too-large" | "invalid-url";

export class FetchError extends Error {
  constructor(
    readonly code: FetchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface Fetcher {
  fetch(request: FetchRequest): Promise<FetchResponse>;
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

export interface RedirectHop {
  url: string;
  status: number;
  location: string;
}

/** A fetched URL, including the redirect chain that led to the final response. */
export interface ResourceRecord {
  url: string;
  chain: RedirectHop[];
  finalUrl: string;
  /** Final status, or null when the request failed. */
  status: number | null;
  headers: Record<string, string>;
  contentType: string | null;
  bodySize: number;
  /** "code: message" when the request failed. */
  error: string | null;
  loop: boolean;
}

export type DiscoveredVia = "root" | "link" | "sitemap" | "canonical";

export interface PageRecord extends ResourceRecord {
  discoveredVia: DiscoveredVia;
  /** HTML as served (only for HTML responses that were not redirects). */
  rawHtml: string | null;
  rawHash: string | null;
  /** HTML after JavaScript ran (only for pages that needed rendering). */
  renderedHtml: string | null;
  renderedHash: string | null;
}

export interface SitemapRecord extends ResourceRecord {
  discoveredVia: "robots" | "common-path" | "index";
  body: string | null;
  gzipped: boolean;
  decodeError: string | null;
}

export type Band = "good" | "needs-improvement" | "poor";

export interface PerformancePage {
  url: string;
  lcp: Band | null;
  inp: Band | null;
  cls: Band | null;
  /** "field" = CrUX real-user data, "lab" = median of 5 Lighthouse runs, "recorded" = fixture. */
  basis: "field" | "lab" | "recorded";
}

export interface PerformanceData {
  source: "fixture" | "psi" | "none";
  pages: PerformancePage[];
  note: string | null;
}

export interface TextResource {
  url: string;
  status: number | null;
  body: string | null;
  error: string | null;
}

export interface CrawlSnapshot {
  crawlerVersion: string;
  inputType: InputType;
  rootUrl: string;
  origin: string;
  /** ISO timestamp supplied by the caller (fixture: _fixture.json; live: job start). */
  crawledAt: string;
  pageLimit: number;
  truncated: boolean;
  robots: TextResource;
  /** Optional /llms.txt (AI-007). */
  llmsTxt: TextResource;
  sitemaps: SitemapRecord[];
  pages: PageRecord[];
  /** Internal URLs we found but did not fetch because robots.txt disallows our crawler. */
  robotsBlocked: string[];
  /** Internal URLs we found but did not fetch because of the page limit. */
  unfetched: string[];
  images: ResourceRecord[];
  externalLinks: ResourceRecord[];
  probes: { notFound: ResourceRecord | null; alternateOrigins: ResourceRecord[] };
  performance: PerformanceData;
}

// ─── Progress ───────────────────────────────────────────────────────────────

export type CrawlStage = "discover" | "crawl" | "render" | "performance";

export interface CrawlEvent {
  stage: CrawlStage;
  message: string;
  /** Status code for fetch log lines ("200 /about"). */
  status?: number | null;
  url?: string;
  done?: number;
  total?: number;
}

export type ProgressListener = (event: CrawlEvent) => void;
