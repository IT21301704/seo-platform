import { describe, expect, it } from "vitest";
import { check, sitemapXml, summary } from "../src/testing";
import { SMP_006 } from "./smp-006-absolute-urls";

describe("SMP-006 absolute same-host https URLs", () => {
  it("passes for absolute https URLs on the site", async () => {
    expect(summary(await check(SMP_006))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for http and other-host URLs", async () => {
    const xml = sitemapXml(["/", "http://example-store.com/about/", "https://cdn.other.com/page/"]);
    expect(summary(await check(SMP_006, { files: { "/sitemap.xml": xml } }))).toEqual([
      "fail http://example-store.com/about/",
      "fail https://cdn.other.com/page/",
      "pass /",
    ]);
  });
});
