import { stableStringify } from "@seo/shared";
import { describe, expect, it } from "vitest";
import { alternateOriginsFor } from "./crawl";
import { snapshotSetHash } from "./hash";
import { buildSiteFacts } from "./site-facts";
import { crawlFixture } from "./test-helpers";

const O = "https://example-store.com";

describe("crawlSite on the golden site", async () => {
  const snapshot = await crawlFixture("golden-site");
  const site = buildSiteFacts(snapshot);

  it("finds all 14 pages, every one 200 and indexable", () => {
    const html200 = site.pages.filter((p) => p.isHtml200);
    expect(html200).toHaveLength(14);
    expect(html200.every((p) => p.isIndexable)).toBe(true);
  });

  it("reads robots.txt and the sitemap", () => {
    expect(snapshot.robots.status).toBe(200);
    expect(snapshot.sitemaps.map((s) => [s.url, s.status, s.discoveredVia])).toEqual([
      [`${O}/sitemap.xml`, 200, "robots"],
    ]);
    expect(site.sitemapEntries.size).toBe(14);
  });

  it("computes click depth from the home page", () => {
    expect(site.pageByUrl.get(`${O}/`)?.depth).toBe(0);
    expect(site.pageByUrl.get(`${O}/about/`)?.depth).toBe(1);
    expect(site.pageByUrl.get(`${O}/products/gift-set/`)?.depth).toBe(1);
    expect(Math.max(...site.pages.map((p) => p.depth ?? 99))).toBeLessThanOrEqual(2);
  });

  it("probes the 404 page and the http/www variants", () => {
    expect(snapshot.probes.notFound?.status).toBe(404);
    expect(snapshot.probes.alternateOrigins.map((r) => [r.url, r.status, r.finalUrl])).toEqual([
      ["http://example-store.com/", 301, `${O}/`],
      ["http://www.example-store.com/", 301, `${O}/`],
      ["https://www.example-store.com/", 301, `${O}/`],
    ]);
  });

  it("checks same-origin images", () => {
    expect(snapshot.images.length).toBeGreaterThan(0);
    expect(snapshot.images.every((i) => i.status === 200)).toBe(true);
  });

  it("marks home, nav pages and their main-content links as important, but not the privacy page", () => {
    expect(site.importantUrls).toContain(`${O}/pricing/`);
    expect(site.importantUrls).toContain(`${O}/products/blue-ceramic-mug/`);
    expect(site.importantUrls).not.toContain(`${O}/policies/privacy/`);
  });

  it("produces byte-identical snapshots on every run", async () => {
    const again = await crawlFixture("golden-site");
    expect(stableStringify(again)).toBe(stableStringify(snapshot));
    expect(snapshotSetHash(again)).toBe(snapshotSetHash(snapshot));
  });
});

describe("crawlSite on broken sites", () => {
  it("records a two-hop redirect chain", async () => {
    const site = buildSiteFacts(await crawlFixture("broken-links"));
    const mugs = site.pageByUrl.get(`${O}/mugs/`);
    expect(mugs?.record.chain.map((h) => h.status)).toEqual([301, 301]);
    expect(mugs?.record.finalUrl).toBe(`${O}/collections/mugs/`);
    expect(site.pageByUrl.get(`${O}/blog/old-post/`)?.record.status).toBe(404);
    // Orphan: only reachable through the sitemap.
    const travel = site.pageByUrl.get(`${O}/products/travel-mug/`);
    expect(travel?.record.discoveredVia).toBe("sitemap");
    expect(travel?.depth).toBeNull();
    expect(travel?.inboundFrom).toEqual([]);
  });

  it("does not fetch URLs that robots.txt disallows", async () => {
    const snapshot = await crawlFixture("broken-technical");
    expect(snapshot.robotsBlocked).toEqual([
      `${O}/products/blue-ceramic-mug/`,
      `${O}/products/gift-set/`,
      `${O}/products/speckled-stoneware-mug/`,
    ]);
    expect(snapshot.probes.notFound?.status).toBe(200);
  });

  it("follows canonical targets", async () => {
    const site = buildSiteFacts(await crawlFixture("broken-indexing"));
    const target = site.pageByUrl.get(`${O}/products/gift-sets/`);
    expect(target?.record.discoveredVia).toBe("canonical");
    expect(target?.record.status).toBe(404);
  });

  it("stops at the page limit in a fixed order", async () => {
    const a = await crawlFixture("golden-site", 5);
    const b = await crawlFixture("golden-site", 5);
    expect(a.pages.map((p) => p.url)).toEqual(b.pages.map((p) => p.url));
    expect(a.pages).toHaveLength(5);
    expect(a.truncated).toBe(true);
  });
});

describe("alternateOriginsFor", () => {
  it("lists http and www variants", () => {
    expect(alternateOriginsFor("https://www.shop.lk")).toEqual([
      "http://shop.lk",
      "http://www.shop.lk",
      "https://shop.lk",
    ]);
  });
});
