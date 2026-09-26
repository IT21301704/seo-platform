import { describe, expect, it } from "vitest";
import { check, sitemapXml, summary } from "../src/testing";
import { SMP_011 } from "./smp-011-lastmod";

describe("SMP-011 lastmod", () => {
  it("passes for past W3C dates", async () => {
    const xml = sitemapXml([
      { path: "/", lastmod: "2026-09-01" },
      { path: "/about/", lastmod: "2026-09-24T10:00:00+05:30" },
    ]);
    expect(summary(await check(SMP_011, { files: { "/sitemap.xml": xml } }))).toEqual([
      "pass /",
      "pass /about/",
    ]);
  });

  it("fails for a future date and an invalid format", async () => {
    const xml = sitemapXml([
      { path: "/", lastmod: "2027-03-01" },
      { path: "/about/", lastmod: "01/09/2026" },
    ]);
    expect(summary(await check(SMP_011, { files: { "/sitemap.xml": xml } }))).toEqual([
      "fail /",
      "fail /about/",
    ]);
  });

  it("is not applicable without lastmod", async () => {
    expect(summary(await check(SMP_011))).toEqual(["na site"]);
  });
});
