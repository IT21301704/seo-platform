import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { ORIGIN, check, sitemapXml, summary } from "../src/testing";
import { SMP_004 } from "./smp-004-valid-xml";

describe("SMP-004 valid sitemap XML", () => {
  it("passes for a valid sitemap", async () => {
    expect(summary(await check(SMP_004))).toEqual(["pass /sitemap.xml"]);
  });

  it("passes for a valid gzipped sitemap", async () => {
    const robots = `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml.gz\n`;
    const files = {
      "/robots.txt": robots,
      "/sitemap.xml": null,
      "/sitemap.xml.gz": gzipSync(sitemapXml(["/", "/about/"])),
    };
    expect(summary(await check(SMP_004, { files }))).toEqual(["pass /sitemap.xml.gz"]);
  });

  it("fails for malformed XML", async () => {
    expect(
      summary(await check(SMP_004, { files: { "/sitemap.xml": "<urlset><url><loc>x</loc>" } })),
    ).toEqual(["fail /sitemap.xml"]);
  });
});
