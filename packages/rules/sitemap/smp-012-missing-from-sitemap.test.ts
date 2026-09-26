import { describe, expect, it } from "vitest";
import { check, sitemapXml, summary } from "../src/testing";
import { SMP_012 } from "./smp-012-missing-from-sitemap";

describe("SMP-012 indexable pages missing from sitemap", () => {
  it("passes when every page is listed", async () => {
    expect(summary(await check(SMP_012))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a page that is not listed", async () => {
    expect(summary(await check(SMP_012, { files: { "/sitemap.xml": sitemapXml(["/"]) } }))).toEqual(
      ["pass /", "fail /about/"],
    );
  });
});
