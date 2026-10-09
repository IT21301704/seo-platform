// Verification after publishing (REQUIREMENTS M14): re-crawl the changed URLs, put the fresh
// responses into the audit snapshot and re-run the same rules.
import {
  buildSiteFacts,
  discoverSitemaps,
  parseRobots,
  refetchPage,
  refetchText,
} from "@seo/crawler";
import type { CrawlSnapshot, Fetcher, OwnerIntent, PageRecord, SiteFacts } from "@seo/crawler";
import type { WpValue } from "@seo/integrations";
import { FIX_KINDS } from "./kinds";
import type { FixKind } from "./kinds";
import { checkFixesOn } from "./recheck";
import type { CheckableFix } from "./recheck";

export interface VerifyResult {
  verified: boolean;
  /** What the live site shows now (for the change log "Before ✗ → After ✓" column). */
  observed: WpValue;
  reason: string | null;
}

const PAGE_KINDS = new Set<FixKind>([
  "meta_description",
  "title",
  "image_alt",
  "link",
  "noindex",
  "canonical",
]);
const SITEMAP_KINDS = new Set<FixKind>(["sitemap_exclude", "sitemap_include"]);

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Re-fetches what the fixes touched and returns the patched snapshot. */
export async function refetchForFixes(
  snapshot: CrawlSnapshot,
  fixes: readonly CheckableFix[],
  fetcher: Fetcher,
): Promise<CrawlSnapshot> {
  const pageUrls = new Set<string>();
  let needRobots = false;
  let needSitemaps = false;
  for (const fix of fixes) {
    if (PAGE_KINDS.has(fix.kind)) pageUrls.add(fix.url);
    if (fix.kind === "redirect" && fix.ref.from)
      pageUrls.add(new URL(fix.ref.from, snapshot.origin).toString());
    if (fix.kind === "robots_sitemap") needRobots = true;
    if (SITEMAP_KINDS.has(fix.kind)) needSitemaps = needRobots = true;
  }
  const fresh = new Map<string, PageRecord>();
  for (const url of [...pageUrls].sort()) {
    const via = snapshot.pages.find((p) => p.url === url)?.discoveredVia ?? "link";
    fresh.set(url, await refetchPage(fetcher, url, via));
  }
  const pages = snapshot.pages.map((p) => fresh.get(p.url) ?? p);
  for (const [url, record] of fresh)
    if (!snapshot.pages.some((p) => p.url === url)) pages.push(record);
  pages.sort((a, b) => a.url.localeCompare(b.url));

  let next: CrawlSnapshot = { ...snapshot, pages };
  if (needRobots)
    next = { ...next, robots: await refetchText(fetcher, `${snapshot.origin}/robots.txt`) };
  if (needSitemaps) {
    const robots = parseRobots(
      next.robots.url,
      next.robots.status === 200 ? next.robots.body : null,
    );
    next = { ...next, sitemaps: await discoverSitemaps(fetcher, snapshot.origin, robots.sitemaps) };
  }
  return next;
}

function observe(fix: CheckableFix, site: SiteFacts): WpValue {
  const page = site.pageByUrl.get(fix.url);
  switch (fix.kind) {
    case "meta_description":
      return page?.facts?.metaDescription ?? null;
    case "title":
      return page?.facts?.title ?? null;
    case "canonical":
      return page?.facts?.canonical ?? null;
    case "noindex":
      return page ? page.noindex : null;
    case "image_alt":
      return page?.facts?.images.find((i) => (i.url ?? i.src) === fix.ref.src)?.alt ?? null;
    case "link":
      return page?.facts?.links.some((l) => l.url === fix.value) ? String(fix.value) : null;
    case "redirect": {
      const from = fix.ref.from ? new URL(fix.ref.from, site.origin).toString() : "";
      const record = site.pageByUrl.get(from)?.record;
      return record && record.chain.length > 0
        ? { to: record.finalUrl, status: record.chain[0]?.status ?? 0 }
        : null;
    }
    case "robots_sitemap":
      return site.robots.parsed.sitemaps.map((s) => `Sitemap: ${s}`);
    case "sitemap_exclude":
    case "sitemap_include":
      return !site.sitemapEntries.has(fix.url);
  }
}

/** True when the live value is the one we published (text fields must match exactly). */
function matches(fix: CheckableFix, observed: WpValue): boolean {
  if (FIX_KINDS[fix.kind].input !== "text") return true;
  return typeof observed === "string" && collapse(observed) === collapse(String(fix.value ?? ""));
}

/** Verifies published fixes against the live site. `fix.value` is the value we published. */
export async function verifyLive(
  snapshot: CrawlSnapshot,
  ownerIntent: OwnerIntent,
  fixes: readonly CheckableFix[],
  fetcher: Fetcher,
): Promise<Map<string, VerifyResult>> {
  const live = await refetchForFixes(snapshot, fixes, fetcher);
  const site = buildSiteFacts(live, { ownerIntent });
  const checks = checkFixesOn(site, fixes);
  const results = new Map<string, VerifyResult>();
  for (const fix of fixes) {
    // A page that did not load proves nothing: never count it as verified.
    const page = PAGE_KINDS.has(fix.kind) ? site.pageByUrl.get(fix.url) : null;
    if (page && !page.isHtml200) {
      results.set(fix.id, {
        verified: false,
        observed: null,
        reason: `The page did not load (${page.record.status ?? page.record.error ?? "no response"})`,
      });
      continue;
    }
    const observed = observe(fix, site);
    const check = checks.get(fix.id);
    const rulePass = check?.result === "pass";
    const valueOk = matches(fix, observed);
    results.set(fix.id, {
      verified: rulePass && valueOk,
      observed,
      reason: !rulePass
        ? (check?.result ?? "Not checked")
        : valueOk
          ? null
          : "The live page shows a different value (cache, theme or another plugin)",
    });
  }
  return results;
}
