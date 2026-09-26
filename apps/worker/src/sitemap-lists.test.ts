import { buildSiteFacts, crawlSite, loadFixtureSite } from "@seo/crawler";
import { ORIGIN, defaultPages, miniSite, page, sitemapXml } from "@seo/rules/testing";
import { describe, expect, it } from "vitest";
import {
  cannotAutoAddReason,
  removeReasons,
  sitemapFiles,
  sitemapUrlRows,
  urlsetXml,
} from "./sitemap-lists";
import { fixtureDir } from "./source";

async function fixtureSite(name: string) {
  const site = loadFixtureSite(fixtureDir(name));
  const snapshot = await crawlSite({
    rootUrl: site.server.origin,
    fetcher: site.fetcher,
    pageLimit: 1000,
    crawledAt: site.server.crawledAt,
  });
  return buildSiteFacts(snapshot);
}

describe("sitemap lists (M17)", () => {
  it("lists nothing to add or remove on the golden site", async () => {
    const rows = sitemapUrlRows(await fixtureSite("golden-site"), {
      cms: "static",
      gscPages: new Set(),
    });
    expect(rows.filter((r) => r.listType !== "ok")).toEqual([]);
    expect(rows).toHaveLength(14);
  });

  it("puts 404 and noindex sitemap URLs on the remove list (never the manual list)", async () => {
    const rows = sitemapUrlRows(await fixtureSite("broken-sitemap"), {
      cms: "static",
      gscPages: new Set(),
    });
    const remove = rows.filter((r) => r.listType === "remove").map((r) => [r.url, r.reason]);
    expect(remove).toEqual([
      [`${ORIGIN}/blog/old-post/`, "Returns 404"],
      [`${ORIGIN}/policies/privacy/`, "noindex"],
    ]);
    expect(rows.filter((r) => r.listType === "manual_add")).toEqual([]);
  });

  it("lists robots-blocked and non-canonical sitemap URLs for removal", async () => {
    const technical = await fixtureSite("broken-technical");
    expect(removeReasons(technical, `${ORIGIN}/products/gift-set/`)).toEqual([
      "Blocked by robots.txt",
    ]);
    const indexing = await fixtureSite("broken-indexing");
    expect(removeReasons(indexing, `${ORIGIN}/products/gift-set/`)).toEqual([
      `Canonical is ${ORIGIN}/products/gift-sets/`,
    ]);
  });

  it("adds only indexable pages that are in no sitemap, with reason, source, lastmod and target file", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", {
        body: '<p><a href="/lookbook/">Lookbook</a> <a href="/draft/">Draft</a></p>',
      }),
      "/lookbook/": page("/lookbook/"),
      "/draft/": page("/draft/", { robots: "noindex" }),
    };
    const site = await miniSite({ pages, files: { "/sitemap.xml": sitemapXml(["/", "/about/"]) } });
    const manual = sitemapUrlRows(site, { cms: "wordpress", gscPages: new Set() }).filter(
      (r) => r.listType === "manual_add",
    );
    expect(manual).toEqual([
      expect.objectContaining({
        url: `${ORIGIN}/lookbook/`,
        reason: cannotAutoAddReason("wordpress"),
        foundVia: "internal_links",
        suggestedLastmod: "2026-09-25",
        targetFile: "sitemap",
      }),
    ]);
    expect(urlsetXml(manual)).toBe(
      `<url>\n  <loc>${ORIGIN}/lookbook/</loc>\n  <lastmod>2026-09-25</lastmod>\n</url>`,
    );
  });

  it("describes sitemap files with generator and URL counts", async () => {
    expect(sitemapFiles(await fixtureSite("golden-site"))).toEqual([
      expect.objectContaining({
        url: `${ORIGIN}/sitemap.xml`,
        kind: "urlset",
        status: 200,
        urlCount: 14,
        generator: "Static or unknown",
        discoveredVia: "robots",
      }),
    ]);
  });
});
