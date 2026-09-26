// Sitemap Validation (REQUIREMENTS M17): sitemap files, the manual "add" list and the "remove"
// list, computed from site facts. Pure and deterministic.
import { detectSitemapGenerator } from "@seo/crawler";
import type { SiteFacts } from "@seo/crawler";
import type { AuditReport } from "@seo/scoring";

export interface SitemapFileRow {
  url: string;
  kind: string;
  status: number | null;
  urlCount: number;
  generator: string;
  discoveredVia: string;
  gscLastDownloaded: string | null;
  gscErrors: number | null;
  gscWarnings: number | null;
}

export interface SitemapUrlRow {
  url: string;
  listType: "ok" | "manual_add" | "remove";
  inSitemap: boolean;
  sitemapFile: string | null;
  status: number | null;
  indexable: boolean;
  gscState: string | null;
  reason: string | null;
  foundVia: "crawl" | "internal_links" | "gsc" | null;
  suggestedLastmod: string | null;
  targetFile: string | null;
}

export interface SitemapCheckSummary {
  score: number | null;
  sitemapsCount: number;
  urlsInSitemaps: number;
  issueCounts: { critical: number; high: number; medium: number; low: number };
  autoFixable: number;
  manualUrls: number;
  urlsToRemove: number;
  gsc: { inspected: number; indexed: number; notIndexed: number; fetchedAt: string } | null;
}

const isIndexedState = (verdict: string, coverage: string): boolean =>
  verdict === "PASS" || /^submitted and indexed$|^indexed/i.test(coverage);

/** Why an indexable page cannot be added to the sitemap automatically (no CMS integration yet). */
export function cannotAutoAddReason(cms: string): string {
  if (cms === "wordpress")
    return "WordPress plugin not connected, so the sitemap cannot be changed automatically";
  if (cms === "static") return "Static HTML site: the sitemap file is edited by hand";
  if (cms === "shopify")
    return "Shopify generates the sitemap; add a link to the page or publish it in Shopify";
  return "No CMS integration connected";
}

/** Reasons a listed URL must come out of the sitemap (empty = keep). */
export function removeReasons(site: SiteFacts, url: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return ["Not an absolute URL"];
  }
  if (parsed.origin !== site.origin)
    return [parsed.protocol !== "https:" ? "Not https" : "Other host"];
  const reasons: string[] = [];
  if (!site.isAllowedForGooglebot(url)) reasons.push("Blocked by robots.txt");
  const page = site.pageByUrl.get(url);
  if (!page) return reasons;
  if (page.record.chain.length > 0) reasons.push(`Redirects to ${page.record.finalUrl}`);
  else if (page.record.status !== 200)
    reasons.push(page.record.status === null ? "Does not load" : `Returns ${page.record.status}`);
  if (page.isHtml200 && page.noindex) reasons.push("noindex");
  const canonical = page.facts?.canonical;
  if (page.isHtml200 && canonical && canonical !== url) reasons.push(`Canonical is ${canonical}`);
  return reasons;
}

function fileBase(url: string): string {
  return (new URL(url).pathname.split("/").pop() ?? "sitemap").replace(/\.xml(\.gz)?$/, "");
}

/** Sitemap file whose URLs share the longest leading path with `url` (for the manual list). */
function targetFileFor(site: SiteFacts, url: string): string | null {
  const urlsets = site.sitemaps.filter((s) => s.parsed?.kind === "urlset");
  if (urlsets.length === 0) return null;
  const segment = new URL(url).pathname.split("/")[1] ?? "";
  const scored = urlsets.map((s) => ({
    file: s.record.url,
    matches: (s.parsed?.entries ?? []).filter((e) => {
      try {
        return new URL(e.loc).pathname.split("/")[1] === segment;
      } catch {
        return false;
      }
    }).length,
  }));
  scored.sort((a, b) => b.matches - a.matches || a.file.localeCompare(b.file));
  return scored[0] ? fileBase(scored[0].file) : null;
}

export function sitemapFiles(site: SiteFacts): SitemapFileRow[] {
  const gscByPath = new Map((site.gsc?.sitemaps ?? []).map((s) => [s.path, s]));
  return site.sitemaps.map(({ record, parsed }) => {
    const gsc = gscByPath.get(record.url);
    return {
      url: record.url,
      kind: parsed?.kind ?? (record.status === 200 ? "invalid" : "missing"),
      status: record.status,
      urlCount:
        parsed?.kind === "sitemapindex" ? parsed.children.length : (parsed?.entries.length ?? 0),
      generator: detectSitemapGenerator(record.url, record.body),
      discoveredVia: record.discoveredVia,
      gscLastDownloaded: gsc?.lastDownloaded ?? null,
      gscErrors: gsc ? gsc.errors : null,
      gscWarnings: gsc ? gsc.warnings : null,
    };
  });
}

export function sitemapUrlRows(
  site: SiteFacts,
  opts: { cms: string; gscPages: ReadonlySet<string> },
): SitemapUrlRow[] {
  const rows: SitemapUrlRow[] = [];
  for (const [url, entry] of [...site.sitemapEntries].sort(([a], [b]) => a.localeCompare(b))) {
    const page = site.pageByUrl.get(url);
    const reasons = removeReasons(site, url);
    const inspection = site.gscInspections.get(url);
    rows.push({
      url,
      listType: reasons.length ? "remove" : "ok",
      inSitemap: true,
      sitemapFile: entry.sitemap,
      status: page?.record.status ?? null,
      indexable: page?.isIndexable ?? false,
      gscState: inspection?.coverageState ?? null,
      reason: reasons.length ? reasons.join("; ") : null,
      foundVia: null,
      suggestedLastmod: entry.lastmod,
      targetFile: null,
    });
  }
  // Manual list: returns 200, self-canonical, no noindex, not robots-blocked, in no sitemap,
  // and cannot be added automatically (REQUIREMENTS M17).
  const reason = cannotAutoAddReason(opts.cms);
  for (const page of site.pages) {
    if (!page.isIndexable || site.sitemapEntries.has(page.url)) continue;
    const lastModified = page.record.headers["last-modified"];
    const lastmod =
      lastModified && !Number.isNaN(Date.parse(lastModified))
        ? new Date(lastModified).toISOString().slice(0, 10)
        : site.crawledAt.slice(0, 10);
    rows.push({
      url: page.url,
      listType: "manual_add",
      inSitemap: false,
      sitemapFile: null,
      status: page.record.status,
      indexable: true,
      gscState: site.gscInspections.get(page.url)?.coverageState ?? null,
      reason,
      foundVia:
        page.inboundFrom.length > 0
          ? "internal_links"
          : opts.gscPages.has(page.url)
            ? "gsc"
            : "crawl",
      suggestedLastmod: lastmod,
      targetFile: targetFileFor(site, page.url),
    });
  }
  return rows;
}

export function sitemapSummary(
  site: SiteFacts,
  report: AuditReport,
  rows: SitemapUrlRow[],
): SitemapCheckSummary {
  const failing = report.rules.filter((r) => r.status === "fail");
  const issueCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of failing) issueCounts[r.severity] += 1;
  const listed = rows.filter((r) => r.inSitemap);
  const inspected = listed.filter((r) => site.gscInspections.has(r.url));
  const indexed = inspected.filter((r) => {
    const i = site.gscInspections.get(r.url);
    return i ? isIndexedState(i.verdict, i.coverageState) : false;
  }).length;
  return {
    score: report.score.sitemap,
    sitemapsCount: site.sitemaps.filter((s) => s.record.status === 200).length,
    urlsInSitemaps: listed.length,
    issueCounts,
    autoFixable: failing.filter((r) => r.autoFixable).length,
    manualUrls: rows.filter((r) => r.listType === "manual_add").length,
    urlsToRemove: rows.filter((r) => r.listType === "remove").length,
    gsc: site.gsc
      ? {
          inspected: inspected.length,
          indexed,
          notIndexed: inspected.length - indexed,
          fetchedAt: site.gsc.fetchedAt,
        }
      : null,
  };
}

/** Ready-to-paste <url> entries (no priority/changefreq: Google ignores them). */
export function urlsetXml(rows: Pick<SitemapUrlRow, "url" | "suggestedLastmod">[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return rows
    .map(
      (r) =>
        `<url>\n  <loc>${esc(r.url)}</loc>${r.suggestedLastmod ? `\n  <lastmod>${r.suggestedLastmod}</lastmod>` : ""}\n</url>`,
    )
    .join("\n");
}
