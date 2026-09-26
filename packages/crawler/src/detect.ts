// Onboarding detection (REQUIREMENTS M1): sitemap, robots.txt, HTTPS and CMS, shown as chips.
import { resolveTxt } from "node:dns/promises";
import { load } from "cheerio";
import { discoverSitemaps } from "./crawl";
import { fetchWithRedirects } from "./redirects";
import { parseRobots } from "./robots";
import { parseSitemap } from "./sitemap";
import type { Fetcher } from "./types";
import { normalizeUrl } from "./url";

export type DetectedCms =
  "wordpress" | "shopify" | "webflow" | "nextjs" | "static" | "other" | "unknown";

export interface Detection {
  /** Final home page URL after redirects (the project's root URL). */
  rootUrl: string;
  reachable: boolean;
  https: boolean;
  error: string | null;
  robots: boolean;
  sitemaps: number;
  sitemapUrls: number;
  cms: DetectedCms;
}

/** Recognises common platforms from HTML and headers (generator tags, asset paths, headers). */
export function detectCms(html: string, headers: Record<string, string> = {}): DetectedCms {
  const $ = load(html);
  const generator = ($('meta[name="generator" i]').attr("content") ?? "").toLowerCase();
  if (generator.includes("wordpress") || /\/wp-(content|includes)\//i.test(html))
    return "wordpress";
  if (
    headers["x-shopid"] ||
    headers["x-shopify-stage"] ||
    /cdn\.shopify\.com|Shopify\.theme/i.test(html)
  )
    return "shopify";
  if (generator.includes("webflow") || /data-wf-(site|page)=/i.test(html)) return "webflow";
  if (
    /id="__NEXT_DATA__"|\/_next\/static\//i.test(html) ||
    headers["x-powered-by"]?.toLowerCase().includes("next.js")
  )
    return "nextjs";
  if ($("script[src]").length === 0) return "static";
  return "other";
}

export async function detectSite(url: string, fetcher: Fetcher): Promise<Detection> {
  const start = normalizeUrl(url.includes("://") ? url : `https://${url}`);
  const empty: Detection = {
    rootUrl: start ?? url,
    reachable: false,
    https: false,
    error: null,
    robots: false,
    sitemaps: 0,
    sitemapUrls: 0,
    cms: "unknown",
  };
  if (!start) return { ...empty, error: "Enter a valid website address" };

  const home = await fetchWithRedirects(fetcher, new URL("/", start).toString());
  if (!home.response || home.record.status === null)
    return { ...empty, error: home.record.error ?? "The site did not respond" };
  const rootUrl = new URL("/", home.record.finalUrl).toString();
  const origin = new URL(rootUrl).origin;
  const html = home.response.body.toString("utf8");

  const robotsRes = await fetchWithRedirects(fetcher, `${origin}/robots.txt`);
  const robotsBody =
    robotsRes.record.status === 200 && robotsRes.response
      ? robotsRes.response.body.toString("utf8")
      : null;
  const sitemaps = await discoverSitemaps(
    fetcher,
    origin,
    parseRobots(`${origin}/robots.txt`, robotsBody).sitemaps,
  );
  const valid = sitemaps.filter((s) => s.status === 200 && s.body);
  const urls = new Set(valid.flatMap((s) => parseSitemap(s.body ?? "").entries.map((e) => e.loc)));

  return {
    rootUrl,
    reachable: true,
    https: rootUrl.startsWith("https://"),
    error: home.record.status >= 400 ? `Home page returned ${home.record.status}` : null,
    robots: robotsBody !== null,
    sitemaps: valid.length,
    sitemapUrls: urls.size,
    cms: detectCms(html, home.response.headers),
  };
}

// ─── Ownership verification ────────────────────────────────────────────────

export type VerificationMethod = "dns" | "meta" | "file";
export const VERIFY_META_NAME = "seo-platform-verification";
export const VERIFY_FILE_PATH = "/seo-platform-verification.txt";

/** Token format shown to the user and stored on the project: "seo-verify=<hex>". */
export function isVerificationToken(token: string): boolean {
  return /^seo-verify=[a-f0-9]{24}$/.test(token);
}

export interface VerifyDeps {
  fetcher: Fetcher;
  resolveTxt?: (host: string) => Promise<string[][]>;
}

/**
 * Checks the token is published: as a DNS TXT record on the host, as
 * <meta name="seo-platform-verification" content="…"> on the home page, or as the only
 * content of /seo-platform-verification.txt. Required before auto-fix and GSC data.
 */
export async function verifyOwnership(
  method: VerificationMethod,
  rootUrl: string,
  token: string,
  deps: VerifyDeps,
): Promise<{ verified: boolean; detail: string }> {
  const { hostname, origin } = new URL(rootUrl);
  if (method === "dns") {
    try {
      const records = await (deps.resolveTxt ?? resolveTxt)(hostname.replace(/^www\./, ""));
      const found = records.some((chunks) => chunks.join("") === token);
      return { verified: found, detail: found ? "TXT record found" : "Waiting for DNS" };
    } catch {
      return { verified: false, detail: "Waiting for DNS" };
    }
  }
  if (method === "meta") {
    const res = await fetchWithRedirects(deps.fetcher, `${origin}/`);
    const content = res.response
      ? load(res.response.body.toString("utf8"))(`meta[name="${VERIFY_META_NAME}"]`).attr("content")
      : undefined;
    const found = content?.trim() === token;
    return {
      verified: found,
      detail: found ? "Meta tag found" : "Meta tag not found on the home page",
    };
  }
  const res = await fetchWithRedirects(deps.fetcher, `${origin}${VERIFY_FILE_PATH}`);
  const found = res.record.status === 200 && res.response?.body.toString("utf8").trim() === token;
  return {
    verified: found,
    detail: found ? "Verification file found" : `File not found at ${VERIFY_FILE_PATH}`,
  };
}
