import { describe, expect, it } from "vitest";
import { check, sitemapXml, summary } from "../src/testing";
import { SMP_005 } from "./smp-005-size-limits";

describe("SMP-005 sitemap size limits", () => {
  it("passes for a small sitemap", async () => {
    expect(summary(await check(SMP_005))).toEqual(["pass /sitemap.xml"]);
  });

  it("fails for more than 50,000 URLs", async () => {
    const paths = Array.from({ length: 50_001 }, (_, i) => `/p/${i}/`);
    const outcomes = await check(SMP_005, { files: { "/sitemap.xml": sitemapXml(paths) }, pageLimit: 3 });
    expect(summary(outcomes)).toEqual(["fail /sitemap.xml"]);
  }, 60_000);
});
