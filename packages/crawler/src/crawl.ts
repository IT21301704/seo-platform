import { gunzipSync } from "node:zlib";
import { CRAWLER_VERSION } from "@seo/shared";
import type { InputType } from "@seo/shared";
import { extractPageFacts } from "./extract";
import { sha256 } from "./hash";
import { fetchWithRedirects } from "./redirects";
import { CRAWLER_TOKEN, parseRobots } from "./robots";
import type { ParsedRobots } from "./robots";
import { parseSitemap } from "./sitemap";
import type {
  CrawlSnapshot,
  DiscoveredVia,
  FetchResponse,
  Fetcher,
  PageRecord,
  ProgressListener,
  ResourceRecord,
  SitemapRecord,
  TextResource,
} from "./types";
import { isSameOrigin, normalizeUrl, pathOf, sortedUnique } from "./url";

export const COMMON_SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"];
export const NOT_FOUND_PROBE_PATH = "/seo-platform-404-probe-7f3c9a/";
const MAX_SITEMAP_FILES = 50;
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;
const MAX_IMAGES = 500;
const MAX_EXTERNAL_LINKS = 100;

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export interface CrawlOptions {
  rootUrl: string;
  fetcher: Fetcher;
  pageLimit: number;
  /** ISO timestamp for this crawl, supplied by the caller (rules never read the clock). */
  crawledAt: string;
  inputType?: InputType;
  onProgress?: ProgressListener;
}

/**
 * Crawls a site in a fixed order: breadth-first from the root, each level sorted by URL, then
 * sitemap URLs that links did not reach. Same site + same options = same snapshot.
 * Performance data is added later by the pipeline (see performance.ts).
 */
export async function crawlSite(options: CrawlOptions): Promise<CrawlSnapshot> {
  const rootUrl = normalizeUrl(options.rootUrl);
  if (!rootUrl) throw new Error(`Invalid root URL: ${options.rootUrl}`);
  const origin = new URL(rootUrl).origin;
  const root = `${origin}/`;
  const emit = options.onProgress ?? (() => undefined);
  const { fetcher } = options;

  // ── Discover: robots.txt and sitemaps ──
  emit({ stage: "discover", message: "Reading robots.txt" });
  const robots = await fetchText(fetcher, `${origin}/robots.txt`);
  const llmsTxt = await fetchText(fetcher, `${origin}/llms.txt`);
  const parsedRobots = parseRobots(robots.url, robots.status === 200 ? robots.body : null);
  const sitemaps = await discoverSitemaps(fetcher, origin, parsedRobots.sitemaps);
  const sitemapUrls = sortedUnique(
    sitemaps
      .flatMap((s) => (s.body && s.decodeError === null ? parseSitemap(s.body).entries : []))
      .map((e) => normalizeUrl(e.loc))
      .filter((u): u is string => u !== null && isSameOrigin(u, origin)),
  );
  emit({
    stage: "discover",
    message: `robots.txt ${robots.status === 200 ? "read" : "not found"}, ${count(sitemaps.filter((s) => s.status === 200).length, "sitemap")} found, ${count(sitemapUrls.length, "URL")} in sitemaps`,
  });

  // ── Crawl pages ──
  const state = new CrawlState(options.pageLimit);
  const via = new Map<string, DiscoveredVia>([[root, "root"]]);
  let frontier = [root];
  let sitemapSeeded = false;
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const url of sortedUnique(frontier)) {
      if (state.seen.has(url)) continue;
      state.seen.add(url);
      if (!parsedRobots.isAllowed(url, CRAWLER_TOKEN)) {
        state.robotsBlocked.push(url);
        continue;
      }
      if (state.pages.length >= options.pageLimit) {
        state.unfetched.push(url);
        continue;
      }
      const page = await crawlPage(fetcher, url, via.get(url) ?? "link");
      state.pages.push(page.record);
      emit({
        stage: "crawl",
        message: `${page.record.status ?? "ERR"} ${pathOf(url)}${page.record.chain.length ? ` → ${pathOf(page.record.finalUrl)}` : ""}`,
        status: page.record.status,
        url,
        done: state.pages.length,
        total: options.pageLimit,
      });
      for (const [found, how] of page.discovered) {
        if (!isSameOrigin(found, origin) || state.seen.has(found)) continue;
        if (!via.has(found)) via.set(found, how);
        next.push(found);
      }
      state.externalLinks.push(...page.external);
      state.images.push(...page.images);
    }
    frontier = next;
    if (frontier.length === 0 && !sitemapSeeded) {
      sitemapSeeded = true;
      frontier = sitemapUrls.filter((u) => !state.seen.has(u));
      for (const u of frontier) if (!via.has(u)) via.set(u, "sitemap");
    }
  }

  // ── Probes and linked resources ──
  const notFound = (await fetchWithRedirects(fetcher, `${origin}${NOT_FOUND_PROBE_PATH}`)).record;
  const alternateOrigins: ResourceRecord[] = [];
  for (const alt of alternateOriginsFor(origin)) {
    alternateOrigins.push(await fetchNoFollow(fetcher, `${alt}/`));
  }
  const images: ResourceRecord[] = [];
  for (const url of sortedUnique(state.images)
    .filter((u) => isSameOrigin(u, origin))
    .slice(0, MAX_IMAGES)) {
    images.push((await fetchWithRedirects(fetcher, url, "HEAD")).record);
  }
  const externalLinks: ResourceRecord[] = [];
  for (const url of sortedUnique(state.externalLinks).slice(0, MAX_EXTERNAL_LINKS)) {
    externalLinks.push((await fetchWithRedirects(fetcher, url, "HEAD")).record);
  }

  return {
    crawlerVersion: CRAWLER_VERSION,
    inputType: options.inputType ?? "url",
    rootUrl: root,
    origin,
    crawledAt: options.crawledAt,
    pageLimit: options.pageLimit,
    truncated: state.unfetched.length > 0,
    robots,
    llmsTxt,
    sitemaps,
    pages: [...state.pages].sort((a, b) => a.url.localeCompare(b.url)),
    robotsBlocked: sortedUnique(state.robotsBlocked),
    unfetched: sortedUnique(state.unfetched),
    images,
    externalLinks,
    probes: { notFound, alternateOrigins },
    performance: { source: "none", pages: [], note: "Performance not measured yet" },
    external: { gsc: null },
  };
}

class CrawlState {
  readonly seen = new Set<string>();
  readonly pages: PageRecord[] = [];
  readonly robotsBlocked: string[] = [];
  readonly unfetched: string[] = [];
  readonly images: string[] = [];
  readonly externalLinks: string[] = [];
  constructor(readonly limit: number) {}
}

interface CrawledPage {
  record: PageRecord;
  discovered: [string, DiscoveredVia][];
  external: string[];
  images: string[];
}

async function crawlPage(fetcher: Fetcher, url: string, via: DiscoveredVia): Promise<CrawledPage> {
  const { record, response } = await fetchWithRedirects(fetcher, url);
  const page: PageRecord = {
    ...record,
    discoveredVia: via,
    rawHtml: null,
    rawHash: null,
    renderedHtml: null,
    renderedHash: null,
  };
  const result: CrawledPage = { record: page, discovered: [], external: [], images: [] };

  // A redirect: the target is crawled as its own URL; this record keeps the chain only.
  if (record.chain.length > 0) {
    if (record.status !== null) result.discovered.push([record.finalUrl, via]);
    return result;
  }
  if (!response || !isHtml(response)) return result;

  const html = decodeHtml(response);
  page.rawHtml = html;
  page.rawHash = sha256(html);
  if (response.status !== 200) return result;

  const facts = extractPageFacts(html, url, response.headers);
  for (const link of facts.links) {
    if (!link.url) continue;
    if (isSameOrigin(link.url, new URL(url).origin)) result.discovered.push([link.url, "link"]);
    else result.external.push(link.url);
  }
  if (facts.canonical) result.discovered.push([facts.canonical, "canonical"]);
  for (const img of facts.images) if (img.url) result.images.push(img.url);
  return result;
}

function isHtml(response: FetchResponse): boolean {
  const type = response.headers["content-type"] ?? "";
  return /text\/html|application\/xhtml\+xml/i.test(type);
}

function decodeHtml(response: FetchResponse): string {
  const charset = /charset=([^;]+)/i.exec(response.headers["content-type"] ?? "")?.[1]?.trim();
  try {
    return new TextDecoder(charset ?? "utf-8").decode(response.body);
  } catch {
    return new TextDecoder("utf-8").decode(response.body);
  }
}

async function fetchText(fetcher: Fetcher, url: string): Promise<TextResource> {
  const { record, response } = await fetchWithRedirects(fetcher, url);
  return {
    url,
    status: record.status,
    body: response && record.status === 200 ? response.body.toString("utf8") : null,
    error: record.error,
  };
}

export async function discoverSitemaps(
  fetcher: Fetcher,
  origin: string,
  fromRobots: string[],
): Promise<SitemapRecord[]> {
  const queue: [string, SitemapRecord["discoveredVia"]][] = [
    ...fromRobots.map((u): [string, SitemapRecord["discoveredVia"]] => [u, "robots"]),
    ...COMMON_SITEMAP_PATHS.map((p): [string, SitemapRecord["discoveredVia"]] => [
      `${origin}${p}`,
      "common-path",
    ]),
  ];
  const seen = new Set<string>();
  const found: SitemapRecord[] = [];
  while (queue.length > 0 && found.length < MAX_SITEMAP_FILES) {
    const [rawUrl, via] = queue.shift() ?? ["", "robots"];
    const url = normalizeUrl(rawUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const { record, response } = await fetchWithRedirects(fetcher, url);
    // Common paths that do not exist are not sitemaps; robots/index-listed ones are kept (SMP-001).
    if (via === "common-path" && record.status !== 200) continue;
    const decoded = response && record.status === 200 ? decodeSitemap(url, response) : null;
    // A guessed path that answers 200 with an HTML page (soft 404) is not a sitemap.
    if (via === "common-path" && !looksLikeSitemap(decoded?.body ?? null)) continue;
    const sitemap: SitemapRecord = {
      ...record,
      discoveredVia: via,
      body: decoded?.body ?? null,
      gzipped: decoded?.gzipped ?? false,
      decodeError: decoded?.error ?? null,
    };
    found.push(sitemap);
    if (sitemap.body) {
      for (const child of parseSitemap(sitemap.body).children) queue.push([child, "index"]);
    }
  }
  return found.sort((a, b) => a.url.localeCompare(b.url));
}

function looksLikeSitemap(body: string | null): boolean {
  return (
    body !== null &&
    /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(urlset|sitemapindex)\b/i.test(body)
  );
}

function decodeSitemap(
  url: string,
  response: FetchResponse,
): { body: string | null; gzipped: boolean; error: string | null } {
  const gzipped =
    url.endsWith(".gz") ||
    /gzip/i.test(response.headers["content-type"] ?? "") ||
    (response.body[0] === 0x1f && response.body[1] === 0x8b);
  try {
    const bytes = gzipped
      ? gunzipSync(response.body, { maxOutputLength: MAX_SITEMAP_BYTES })
      : response.body;
    return { body: bytes.toString("utf8"), gzipped, error: null };
  } catch (error) {
    return { body: null, gzipped, error: `Invalid gzip: ${(error as Error).message}` };
  }
}

/** HTTP and www/apex variants of the origin, which should all redirect to it. */
export function alternateOriginsFor(origin: string): string[] {
  const { protocol, host } = new URL(origin);
  const other = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const variants = [`http://${host}`, `http://${other}`, `https://${other}`];
  return variants.filter((v) => v !== `${protocol}//${host}`).sort();
}

async function fetchNoFollow(fetcher: Fetcher, url: string): Promise<ResourceRecord> {
  try {
    const res = await fetcher.fetch({ url, method: "GET" });
    const location = res.headers["location"];
    const next = location ? normalizeUrl(location, url) : null;
    return {
      url,
      chain:
        next && res.status >= 300 && res.status < 400
          ? [{ url, status: res.status, location: next }]
          : [],
      finalUrl: next ?? url,
      status: res.status,
      headers: res.headers,
      contentType: res.headers["content-type"] ?? null,
      bodySize: res.bodySize,
      error: null,
      loop: false,
    };
  } catch (error) {
    return {
      url,
      chain: [],
      finalUrl: url,
      status: null,
      headers: {},
      contentType: null,
      bodySize: 0,
      error: String((error as Error).message),
      loop: false,
    };
  }
}

export { type ParsedRobots };
