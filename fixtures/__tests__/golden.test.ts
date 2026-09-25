// Sanity checks that the golden site really is "perfect" before any rule engine exists.
// Phase 1 rules must agree with these (golden site = 100).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "cheerio";
import type { CheerioAPI } from "cheerio";
import { describe, expect, it } from "vitest";
import { GOLDEN_DIR, htmlPages, readFixtureServer } from "./helpers";

const server = readFixtureServer(GOLDEN_DIR);
const ORIGIN = server.origin;
const pages = htmlPages(GOLDEN_DIR).map((p) => ({ ...p, $: load(p.html) }));
const pagePaths = new Set(pages.map((p) => p.path));

type JsonLdNode = Record<string, unknown> & { "@type"?: string | string[] };

function jsonLdNodes($: CheerioAPI): JsonLdNode[] {
  return $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((el) => {
      const doc = JSON.parse($(el).text()) as { "@graph"?: JsonLdNode[] } & JsonLdNode;
      return doc["@graph"] ?? [doc];
    });
}

function nodesOfType($: CheerioAPI, type: string): JsonLdNode[] {
  return jsonLdNodes($).filter((n) => [n["@type"]].flat().includes(type));
}

/** Internal hrefs, resolved to a path without query or fragment. */
function internalLinks($: CheerioAPI, fromPath: string): string[] {
  return $("a[href]")
    .toArray()
    .map((el) => $(el).attr("href") ?? "")
    .filter((href) => !/^(mailto:|tel:|#)/.test(href))
    .map((href) => new URL(href, `${ORIGIN}${fromPath}`))
    .filter((url) => url.origin === ORIGIN)
    .map((url) => url.pathname);
}

const text = (s: string) => s.replace(/\s+/g, " ").trim();

it("has 14 pages", () => {
  expect(pages.length).toBe(14);
});

describe.each(pages)("$path", ({ path, $ }) => {
  const url = `${ORIGIN}${path}`;

  it("has lang, charset and viewport", () => {
    expect($("html").attr("lang")).toBe("en");
    expect($("meta[charset]").attr("charset")).toBe("utf-8");
    expect($('meta[name="viewport"]').attr("content")).toContain("width=device-width");
  });

  it("has a title of 30–60 characters and a description of 70–160", () => {
    expect($("title").text().length).toBeGreaterThanOrEqual(30);
    expect($("title").text().length).toBeLessThanOrEqual(60);
    const description = $('meta[name="description"]').attr("content") ?? "";
    expect(description.length).toBeGreaterThanOrEqual(70);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("is self-canonical and indexable", () => {
    expect($('link[rel="canonical"]').attr("href")).toBe(url);
    expect($('meta[name="robots"]').length).toBe(0);
  });

  it("has exactly one H1 and no skipped heading levels", () => {
    expect($("h1").length).toBe(1);
    const levels = $("h1, h2, h3, h4, h5, h6")
      .toArray()
      .map((el) => Number(el.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    levels.forEach((level, i) => {
      if (i > 0) expect(level - (levels[i - 1] ?? 1)).toBeLessThanOrEqual(1);
    });
  });

  it("has Open Graph and Twitter tags", () => {
    for (const prop of ["og:title", "og:description", "og:type", "og:image", "og:site_name"]) {
      expect($(`meta[property="${prop}"]`).attr("content"), prop).toBeTruthy();
    }
    expect($('meta[property="og:url"]').attr("content")).toBe(url);
    expect($('meta[name="twitter:card"]').attr("content")).toBe("summary_large_image");
  });

  it("has images with alt, dimensions, descriptive names, and lazy loading below the first", () => {
    $("img").each((_, el) => {
      const img = $(el);
      expect(img.attr("alt")?.trim(), img.attr("src")).toBeTruthy();
      expect(img.attr("width")).toMatch(/^\d+$/);
      expect(img.attr("height")).toMatch(/^\d+$/);
      expect(img.attr("src")).toMatch(/^\/images\/[a-z]+(-[a-z]+)+\.(svg|png|webp|avif)$/);
    });
    $("main img").each((i, el) => {
      expect($(el).attr("loading")).toBe(i === 0 ? undefined : "lazy");
    });
  });

  it("has valid JSON-LD, with a BreadcrumbList on every page except home", () => {
    expect(() => jsonLdNodes($)).not.toThrow();
    expect(nodesOfType($, "BreadcrumbList").length).toBe(path === "/" ? 0 : 1);
  });

  it("puts all content in the raw HTML (no scripts other than JSON-LD)", () => {
    expect($("script:not([type='application/ld+json'])").length).toBe(0);
    expect(text($("main").text()).split(" ").length).toBeGreaterThan(50);
  });

  it("has only working internal links and assets", () => {
    for (const link of internalLinks($, path)) expect(pagePaths.has(link), link).toBe(true);
    const assets = [
      ...$("img[src]")
        .toArray()
        .map((el) => $(el).attr("src") ?? ""),
      ...$("link[href]:not([rel='canonical'])")
        .toArray()
        .map((el) => $(el).attr("href") ?? ""),
    ];
    for (const asset of assets) expect(existsSync(join(GOLDEN_DIR, asset)), asset).toBe(true);
  });

  it("shows the same name, address and phone in the footer", () => {
    expect(text($("footer address").text())).toBe(
      "Example Store Ceramics 24 Lighthouse Street, Galle Fort, Galle 80000, Sri Lanka Phone: +94 91 222 0142 · Email: hello@example-store.com",
    );
  });
});

describe("site-wide", () => {
  it("titles and descriptions are unique", () => {
    const titles = pages.map((p) => p.$("title").text());
    const descriptions = pages.map((p) => p.$('meta[name="description"]').attr("content"));
    expect(new Set(titles).size).toBe(pages.length);
    expect(new Set(descriptions).size).toBe(pages.length);
  });

  it("every page is reachable from the home page within 3 clicks", () => {
    const depth = new Map<string, number>([["/", 0]]);
    const queue = ["/"];
    while (queue.length > 0) {
      const current = queue.shift() ?? "/";
      const page = pages.find((p) => p.path === current);
      if (!page) continue;
      for (const link of internalLinks(page.$, current).sort()) {
        if (!depth.has(link)) {
          depth.set(link, (depth.get(current) ?? 0) + 1);
          queue.push(link);
        }
      }
    }
    for (const p of pagePaths) {
      expect(depth.get(p), p).toBeDefined();
      expect(depth.get(p)).toBeLessThanOrEqual(3);
    }
  });

  it("sitemap.xml lists exactly the indexable pages with valid past lastmod dates", () => {
    const $ = load(readFileSync(join(GOLDEN_DIR, "sitemap.xml"), "utf8"), { xml: true });
    const locs = $("url > loc")
      .toArray()
      .map((el) => $(el).text());
    expect(locs).toEqual([...pagePaths].sort().map((p) => `${ORIGIN}${p}`));
    $("url > lastmod").each((_, el) => {
      const lastmod = $(el).text();
      expect(lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(lastmod).getTime()).toBeLessThanOrEqual(new Date(server.crawledAt).getTime());
    });
  });

  it("robots.txt allows everything, names the sitemap, and allows the AI crawlers", () => {
    const robots = readFileSync(join(GOLDEN_DIR, "robots.txt"), "utf8");
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots).not.toMatch(/^Disallow:\s*\S/m);
    for (const bot of [
      "Googlebot",
      "Google-Extended",
      "GPTBot",
      "OAI-SearchBot",
      "ClaudeBot",
      "PerplexityBot",
    ]) {
      expect(robots).toContain(`User-agent: ${bot}\nAllow: /`);
    }
    expect(server.ownerIntent.aiCrawlers).toBe("allow");
  });

  it("has an llms.txt that links only to real pages", () => {
    const llms = readFileSync(join(GOLDEN_DIR, "llms.txt"), "utf8");
    const links = [...llms.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map(
      (m) => new URL(m[1] ?? "").pathname,
    );
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) expect(pagePaths.has(link), link).toBe(true);
  });

  it("serves a real 404 page", () => {
    expect(server.notFoundStatus).toBe(404);
    const $ = load(readFileSync(join(GOLDEN_DIR, server.notFoundFile), "utf8"));
    expect($('meta[name="robots"]').attr("content")).toBe("noindex");
    expect($("h1").text()).toBe("Page not found");
  });

  it("has clear About, Services, Pricing, Contact, FAQ and Policies pages", () => {
    for (const p of [
      "/about/",
      "/services/",
      "/pricing/",
      "/contact/",
      "/faq/",
      "/policies/shipping-returns/",
      "/policies/privacy/",
    ]) {
      expect(pagePaths.has(p), p).toBe(true);
    }
  });
});

describe("structured data", () => {
  const byPath = (path: string) => {
    const page = pages.find((p) => p.path === path);
    if (!page) throw new Error(`missing ${path}`);
    return page.$;
  };

  it("home has Organization, a LocalBusiness (Store) and WebSite", () => {
    const $ = byPath("/");
    expect(nodesOfType($, "Organization")).toHaveLength(1);
    expect(nodesOfType($, "Store")).toHaveLength(1);
    expect(nodesOfType($, "WebSite")).toHaveLength(1);
  });

  it.each([
    "/products/blue-ceramic-mug/",
    "/products/speckled-stoneware-mug/",
    "/products/gift-set/",
  ])("%s has a Product with offers matching the visible price", (path) => {
    const $ = byPath(path);
    const [product] = nodesOfType($, "Product");
    const offers = product?.["offers"] as { price: string; priceCurrency: string } | undefined;
    expect(offers?.priceCurrency).toBe("LKR");
    const visible = $(".price").text().replace(/[^\d]/g, "");
    expect(offers?.price).toBe(visible);
    expect(product?.["name"]).toBe($("h1").text());
  });

  it("/services/ has Service nodes", () => {
    expect(nodesOfType(byPath("/services/"), "Service").length).toBeGreaterThan(0);
  });

  it("/blog/care-guide/ has a BlogPosting", () => {
    const [post] = nodesOfType(byPath("/blog/care-guide/"), "BlogPosting");
    expect(post?.["headline"]).toBe(byPath("/blog/care-guide/")("h1").text());
  });

  it("/faq/ FAQPage matches the visible questions and answers", () => {
    const $ = byPath("/faq/");
    const [faq] = nodesOfType($, "FAQPage");
    const entities = faq?.["mainEntity"] as { name: string; acceptedAnswer: { text: string } }[];
    const visible = $(".faq h2")
      .toArray()
      .map((el) => ({ q: text($(el).text()), a: text($(el).next("p").text()) }));
    expect(entities.map((e) => ({ q: e.name, a: e.acceptedAnswer.text }))).toEqual(visible);
  });
});
