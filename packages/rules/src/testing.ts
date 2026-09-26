// Test harness: build a tiny site in memory, crawl it with the real crawler, and evaluate a rule.
// Each rule test defines a passing and a failing mini-site ("pass fixture" / "fail fixture").
import { MemoryFetcher, buildSiteFacts, crawlSite } from "@seo/crawler";
import type { GscExternal, OwnerIntent, PerformanceData, SiteFacts } from "@seo/crawler";
import type { FixtureServer, InputType } from "@seo/shared";
import { evaluateRule } from "./engine";
import type { RuleDefinition, RuleOutcome } from "./types";

export const ORIGIN = "https://example-store.com";
export const CRAWLED_AT = "2026-09-25T00:00:00Z";

const FILLER =
  "Every mug is thrown on the wheel, trimmed, glazed and fired by hand in small batches in our studio. " +
  "Our glazes are food safe and lead free, and every mug is dishwasher and microwave safe. " +
  "We ship across the country in two to four working days and accept returns within fourteen days. " +
  "Custom orders for cafés and hotels start at twelve mugs, and our weekend workshops teach beginners to throw a mug.";

export interface PageOptions {
  title?: string | null;
  description?: string | null;
  /** Absolute canonical URL; default is the page's own URL; null removes it. */
  canonical?: string | null;
  lang?: string | null;
  h1?: string | string[];
  /** Content of <main> after the H1 (default: ~70 words and a breadcrumb). */
  body?: string;
  /** Extra tags inside <head>. */
  head?: string;
  robots?: string;
  jsonLd?: object[];
  og?: boolean;
  viewport?: string | null;
  /** Header navigation links. */
  nav?: string[];
}

/** A complete, valid HTML page for `path` (passes every page rule unless overridden). */
export function page(path: string, options: PageOptions = {}): string {
  const url = `${ORIGIN}${path}`;
  const name = path === "/" ? "Home" : path.split("/").filter(Boolean).join(" ");
  const title =
    options.title === undefined ? `${name} page for mini test site | Example Store` : options.title;
  const description =
    options.description === undefined
      ? `This is the ${name} page of a mini test site used to check one SEO rule at a time.`
      : options.description;
  const canonical = options.canonical === undefined ? url : options.canonical;
  const h1s = [options.h1 ?? `Heading for ${name}`].flat();
  const meta = [
    title === null ? "" : `<title>${title}</title>`,
    description === null ? "" : `<meta name="description" content="${description}">`,
    canonical === null ? "" : `<link rel="canonical" href="${canonical}">`,
    options.robots ? `<meta name="robots" content="${options.robots}">` : "",
    options.viewport === null
      ? ""
      : `<meta name="viewport" content="${options.viewport ?? "width=device-width, initial-scale=1"}">`,
    options.og === false
      ? ""
      : [
          `<meta property="og:type" content="website">`,
          `<meta property="og:title" content="${name}">`,
          `<meta property="og:description" content="${name} description">`,
          `<meta property="og:url" content="${url}">`,
          `<meta property="og:image" content="${ORIGIN}/images/og-default.png">`,
          `<meta name="twitter:card" content="summary_large_image">`,
        ].join(""),
    ...(options.jsonLd ?? []).map(
      (j) =>
        `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...j })}</script>`,
    ),
    options.head ?? "",
  ].join("\n");
  const lang = options.lang === null ? "" : ` lang="${options.lang ?? "en"}"`;
  const nav = (options.nav ?? []).map((href) => `<a href="${href}">Nav ${href}</a>`).join(" ");
  const crumbs =
    path === "/" ? "" : `<nav aria-label="Breadcrumb"><a href="/">Home</a> / ${name}</nav>`;
  return `<!doctype html>
<html${lang}>
<head>
<meta charset="utf-8">
${meta}
</head>
<body>
<header><a href="/">Example Store</a> <nav>${nav}</nav></header>
<main>
${crumbs}
${h1s.map((h) => `<h1>${h}</h1>`).join("\n")}
${options.body ?? `<p>${FILLER}</p>`}
</main>
<footer><p>Example Store</p></footer>
</body>
</html>
`;
}

export function sitemapXml(
  entries: (string | { path: string; lastmod?: string; extra?: string })[],
): string {
  const urls = entries
    .map((e) => (typeof e === "string" ? { path: e } : e))
    .map(
      (e) =>
        `  <url>\n    <loc>${e.path.startsWith("http") ? e.path : `${ORIGIN}${e.path}`}</loc>\n` +
        (e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : "") +
        ("extra" in e && e.extra ? `    ${e.extra}\n` : "") +
        "  </url>",
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls}
</urlset>
`;
}

export const DEFAULT_ROBOTS = `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;

export interface MiniSiteOptions {
  /** Path → HTML. Default: a home page linking to /about/ and an /about/ page. */
  pages?: Record<string, string>;
  /** Other files by path ("/robots.txt"); `null` removes a default file. */
  files?: Record<string, string | Buffer | null>;
  server?: Partial<FixtureServer>;
  ownerIntent?: OwnerIntent;
  inputType?: InputType;
  performance?: PerformanceData;
  /** Search Console snapshot the rules see (default: not connected). */
  gsc?: Partial<GscExternal>;
  pageLimit?: number;
}

export function defaultPages(): Record<string, string> {
  return {
    "/": page("/", { nav: ["/about/"] }),
    "/about/": page("/about/", { nav: ["/about/"] }),
  };
}

function pathToFile(path: string): string {
  return path.endsWith("/") ? `${path}index.html` : path;
}

/** Crawls the mini-site with the real crawler and returns the facts rules see. */
export async function miniSite(options: MiniSiteOptions = {}): Promise<SiteFacts> {
  const pages = options.pages ?? defaultPages();
  const files = new Map<string, Buffer>();
  for (const [path, html] of Object.entries(pages)) files.set(pathToFile(path), Buffer.from(html));
  const defaults: Record<string, string> = {
    "/robots.txt": DEFAULT_ROBOTS,
    "/sitemap.xml": sitemapXml(Object.keys(pages).filter((p) => p.endsWith("/"))),
    "/404.html":
      '<!doctype html><html lang="en"><head><title>Not found</title><meta name="robots" content="noindex"></head><body><h1>Not found</h1></body></html>',
  };
  for (const [path, content] of Object.entries({ ...defaults, ...options.files })) {
    if (content === null) files.delete(path);
    else files.set(path, Buffer.isBuffer(content) ? content : Buffer.from(content));
  }
  const server: FixtureServer = {
    origin: ORIGIN,
    crawledAt: CRAWLED_AT,
    alternateOrigins: [
      "http://example-store.com",
      "http://www.example-store.com",
      "https://www.example-store.com",
    ],
    statusOverrides: {},
    redirects: [],
    notFoundFile: "404.html",
    notFoundStatus: 404,
    compression: "br",
    headers: { "cache-control": "public, max-age=3600" },
    performance: { lcp: "good", inp: "good", cls: "good" },
    ownerIntent: { aiCrawlers: "allow" },
    ...options.server,
  };
  const snapshot = await crawlSite({
    rootUrl: ORIGIN,
    fetcher: new MemoryFetcher(files, server),
    pageLimit: options.pageLimit ?? 100,
    crawledAt: server.crawledAt,
    inputType: options.inputType ?? "url",
  });
  if (options.gsc) {
    snapshot.external = {
      gsc: {
        snapshotId: "gsc_test",
        siteUrl: "sc-domain:example-store.com",
        dataDate: "2026-09-22",
        fetchedAt: CRAWLED_AT,
        sitemaps: [],
        inspections: [],
        ...options.gsc,
      },
    };
  }
  snapshot.performance = options.performance ?? {
    source: "fixture",
    pages: [{ url: `${ORIGIN}/`, ...server.performance, basis: "recorded" }],
    note: null,
  };
  return buildSiteFacts(snapshot, { ownerIntent: options.ownerIntent ?? server.ownerIntent });
}

/** Evaluates one rule on a mini-site. */
export async function check(
  rule: RuleDefinition,
  options: MiniSiteOptions = {},
): Promise<RuleOutcome[]> {
  return evaluateRule(rule, await miniSite(options));
}

/** Compact view for assertions: ["pass /about/", "fail site"]. */
export function summary(outcomes: RuleOutcome[]): string[] {
  return outcomes.map((o) => `${o.result} ${o.url === null ? "site" : o.url.replace(ORIGIN, "")}`);
}

/** The result of the rule for one path. */
export function resultFor(outcomes: RuleOutcome[], path: string | null): string | undefined {
  const url = path === null ? null : `${ORIGIN}${path}`;
  return outcomes.find((o) => o.url === url)?.result;
}
