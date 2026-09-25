import type { InputType } from "@seo/shared";
import { extractPageFacts } from "./extract";
import type { PageFacts } from "./extract";
import { GOOGLEBOT, parseRobots } from "./robots";
import type { ParsedRobots } from "./robots";
import { parseSitemap } from "./sitemap";
import type { ParsedSitemap, SitemapEntry } from "./sitemap";
import type {
  CrawlSnapshot,
  PageRecord,
  PerformanceData,
  ResourceRecord,
  SitemapRecord,
} from "./types";
import { isSameOrigin, sortedUnique } from "./url";

export interface OwnerIntent {
  /** Whether the owner wants AI crawlers (GPTBot, ClaudeBot, ...) to read the site. */
  aiCrawlers: "allow" | "block";
}

export interface SitePage {
  url: string;
  record: PageRecord;
  /** Facts from the HTML as served (null for non-HTML, redirects and errors). */
  raw: PageFacts | null;
  /** Facts after JavaScript ran (only rendered pages). */
  rendered: PageFacts | null;
  /** What rules evaluate: rendered when available, else raw. */
  facts: PageFacts | null;
  /** Clicks from the home page following <a> links; null when unreachable. */
  depth: number | null;
  /** Pages linking here with an <a href> (sorted). */
  inboundFrom: string[];
  /** 200, HTML, no redirect. */
  isHtml200: boolean;
  noindex: boolean;
  /** 200 HTML page that search engines may index: no noindex, allowed for Googlebot, self or no canonical. */
  isIndexable: boolean;
}

export interface SitemapFile {
  record: SitemapRecord;
  parsed: ParsedSitemap | null;
}

export interface SiteFacts {
  inputType: InputType;
  origin: string;
  rootUrl: string;
  crawledAt: string;
  truncated: boolean;
  ownerIntent: OwnerIntent;
  robots: CrawlSnapshot["robots"] & { parsed: ParsedRobots };
  llmsTxt: CrawlSnapshot["llmsTxt"];
  sitemaps: SitemapFile[];
  /** Every same-origin URL listed in any sitemap → its entry (first wins, files in URL order). */
  sitemapEntries: Map<string, SitemapEntry & { sitemap: string }>;
  pages: SitePage[];
  pageByUrl: Map<string, SitePage>;
  robotsBlocked: string[];
  images: Map<string, ResourceRecord>;
  externalLinks: Map<string, ResourceRecord>;
  probes: CrawlSnapshot["probes"];
  performance: PerformanceData;
  /** Home, header-nav pages, and pages linked from the main content of those pages. */
  importantUrls: string[];
  isAllowedForGooglebot(url: string): boolean;
}

export interface BuildSiteFactsOptions {
  ownerIntent?: OwnerIntent;
}

export function buildSiteFacts(
  snapshot: CrawlSnapshot,
  options: BuildSiteFactsOptions = {},
): SiteFacts {
  const robotsParsed = parseRobots(snapshot.robots.url, snapshot.robots.status === 200 ? snapshot.robots.body : null);
  const isAllowedForGooglebot = (url: string) => robotsParsed.isAllowed(url, GOOGLEBOT);

  const pages = snapshot.pages.map((record) => basePage(record, isAllowedForGooglebot));
  const pageByUrl = new Map(pages.map((p) => [p.url, p]));
  linkGraph(pages, pageByUrl, snapshot.origin, snapshot.rootUrl);

  const sitemaps = snapshot.sitemaps.map((record) => ({
    record,
    parsed: record.body !== null ? parseSitemap(record.body) : null,
  }));
  const sitemapEntries = new Map<string, SitemapEntry & { sitemap: string }>();
  for (const file of sitemaps) {
    for (const entry of file.parsed?.entries ?? []) {
      let loc: string;
      try {
        loc = new URL(entry.loc).toString();
      } catch {
        continue;
      }
      if (!sitemapEntries.has(loc)) sitemapEntries.set(loc, { ...entry, sitemap: file.record.url });
    }
  }

  return {
    inputType: snapshot.inputType,
    origin: snapshot.origin,
    rootUrl: snapshot.rootUrl,
    crawledAt: snapshot.crawledAt,
    truncated: snapshot.truncated,
    ownerIntent: options.ownerIntent ?? { aiCrawlers: "allow" },
    robots: { ...snapshot.robots, parsed: robotsParsed },
    llmsTxt: snapshot.llmsTxt,
    sitemaps,
    sitemapEntries,
    pages,
    pageByUrl,
    robotsBlocked: snapshot.robotsBlocked,
    images: new Map(snapshot.images.map((r) => [r.url, r])),
    externalLinks: new Map(snapshot.externalLinks.map((r) => [r.url, r])),
    probes: snapshot.probes,
    performance: snapshot.performance,
    importantUrls: importantUrls(pageByUrl, snapshot.rootUrl, snapshot.origin),
    isAllowedForGooglebot,
  };
}

function basePage(record: PageRecord, allowed: (url: string) => boolean): SitePage {
  const raw = record.rawHtml !== null ? extractPageFacts(record.rawHtml, record.url, record.headers) : null;
  const rendered =
    record.renderedHtml !== null ? extractPageFacts(record.renderedHtml, record.url, record.headers) : null;
  const facts = rendered ?? raw;
  const isHtml200 = record.status === 200 && record.chain.length === 0 && raw !== null;
  const noindex = facts?.robotsDirectives.some((d) => d === "noindex" || d === "none") ?? false;
  const canonicalOk = !facts?.canonical || facts.canonical === record.url;
  return {
    url: record.url,
    record,
    raw,
    rendered,
    facts,
    depth: null,
    inboundFrom: [],
    isHtml200,
    noindex,
    isIndexable: isHtml200 && !noindex && allowed(record.url) && canonicalOk,
  };
}

/** Fills depth (BFS over <a> links from the root) and inboundFrom. */
function linkGraph(pages: SitePage[], byUrl: Map<string, SitePage>, origin: string, root: string): void {
  const inbound = new Map<string, Set<string>>();
  const outbound = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.isHtml200 || !page.facts) continue;
    const targets = sortedUnique(
      page.facts.links
        .map((l) => l.url)
        .filter((u): u is string => u !== null && isSameOrigin(u, origin) && u !== page.url),
    );
    outbound.set(page.url, targets);
    for (const t of targets) {
      const set = inbound.get(t) ?? new Set<string>();
      set.add(page.url);
      inbound.set(t, set);
    }
  }
  for (const page of pages) page.inboundFrom = sortedUnique(inbound.get(page.url) ?? []);

  const depth = new Map<string, number>([[root, 0]]);
  let frontier = [root];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const url of frontier) {
      // Follow redirects: a link to /mugs/ reaches the page /mugs/ redirects to.
      const page = byUrl.get(url);
      const resolved = page && page.record.chain.length > 0 ? page.record.finalUrl : url;
      const d = depth.get(url) ?? 0;
      if (resolved !== url && !depth.has(resolved)) {
        depth.set(resolved, d);
        next.push(resolved);
      }
      for (const t of outbound.get(resolved) ?? []) {
        if (!depth.has(t)) {
          depth.set(t, d + 1);
          next.push(t);
        }
      }
    }
    frontier = sortedUnique(next);
  }
  for (const page of pages) page.depth = depth.get(page.url) ?? null;
}

function importantUrls(byUrl: Map<string, SitePage>, root: string, origin: string): string[] {
  const home = byUrl.get(root)?.facts;
  if (!home) return [root];
  const internal = (urls: (string | null)[]) =>
    urls.filter((u): u is string => u !== null && isSameOrigin(u, origin));
  const navPages = internal(home.links.filter((l) => l.region === "header").map((l) => l.url));
  const important = new Set<string>([root, ...navPages]);
  for (const url of [root, ...navPages]) {
    const facts = byUrl.get(url)?.facts;
    if (!facts) continue;
    for (const u of internal(facts.links.filter((l) => l.region === "main").map((l) => l.url))) {
      important.add(u);
    }
  }
  return sortedUnique(important);
}
