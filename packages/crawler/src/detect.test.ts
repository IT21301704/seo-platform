import { describe, expect, it } from "vitest";
import { detectCms, detectSite, verifyOwnership } from "./detect";
import { MemoryFetcher, loadFixtureSite } from "./memory-fetcher";
import { fixtureDir } from "./test-helpers";

const TOKEN = "seo-verify=0123456789abcdef01234567";

describe("detectCms", () => {
  it.each([
    ['<meta name="generator" content="WordPress 6.6">', "wordpress"],
    ['<link href="/wp-content/themes/x/style.css">', "wordpress"],
    ['<script src="https://cdn.shopify.com/s/files/x.js"></script>', "shopify"],
    ['<html data-wf-site="abc">', "webflow"],
    [
      '<script id="__NEXT_DATA__" type="application/json">{}</script><script src="/_next/static/x.js"></script>',
      "nextjs",
    ],
    ["<p>Plain</p>", "static"],
    ['<script src="/app.js"></script>', "other"],
  ])("%s → %s", (html, cms) => {
    expect(detectCms(html)).toBe(cms);
  });
});

describe("detectSite", () => {
  it("finds robots.txt, the sitemap and HTTPS on the golden site", async () => {
    const site = loadFixtureSite(fixtureDir("golden-site"));
    expect(await detectSite("example-store.com", site.fetcher)).toEqual({
      rootUrl: "https://example-store.com/",
      reachable: true,
      https: true,
      error: null,
      robots: true,
      sitemaps: 1,
      sitemapUrls: 14,
      cms: "static",
    });
  });

  it("reports unreachable sites", async () => {
    const site = loadFixtureSite(fixtureDir("golden-site"));
    const result = await detectSite("https://nowhere.example/", site.fetcher);
    expect(result.reachable).toBe(false);
    expect(result.error).toContain("ENOTFOUND");
  });
});

describe("verifyOwnership", () => {
  const server = loadFixtureSite(fixtureDir("golden-site")).server;
  const withFiles = (files: Record<string, string>) =>
    new MemoryFetcher(new Map(Object.entries(files).map(([k, v]) => [k, Buffer.from(v)])), server);

  it("accepts a matching DNS TXT record", async () => {
    const result = await verifyOwnership("dns", "https://example-store.com/", TOKEN, {
      fetcher: withFiles({}),
      resolveTxt: async () => [["v=spf1 -all"], [TOKEN]],
    });
    expect(result.verified).toBe(true);
  });

  it("waits while DNS has no record", async () => {
    const result = await verifyOwnership("dns", "https://example-store.com/", TOKEN, {
      fetcher: withFiles({}),
      resolveTxt: async () => [],
    });
    expect(result).toEqual({ verified: false, detail: "Waiting for DNS" });
  });

  it("accepts the meta tag on the home page", async () => {
    const fetcher = withFiles({
      "/index.html": `<html><head><meta name="seo-platform-verification" content="${TOKEN}"></head></html>`,
    });
    expect(
      (await verifyOwnership("meta", "https://example-store.com/", TOKEN, { fetcher })).verified,
    ).toBe(true);
  });

  it("accepts the verification file and rejects a wrong token", async () => {
    const fetcher = withFiles({ "/seo-platform-verification.txt": `${TOKEN}\n` });
    expect(
      (await verifyOwnership("file", "https://example-store.com/", TOKEN, { fetcher })).verified,
    ).toBe(true);
    expect(
      (
        await verifyOwnership(
          "file",
          "https://example-store.com/",
          "seo-verify=ffffffffffffffffffffffff",
          { fetcher },
        )
      ).verified,
    ).toBe(false);
  });
});
