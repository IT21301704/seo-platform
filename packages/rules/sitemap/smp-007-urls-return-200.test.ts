import { describe, expect, it } from "vitest";
import { check, sitemapXml, summary } from "../src/testing";
import { SMP_007 } from "./smp-007-urls-return-200";

describe("SMP-007 sitemap URLs return 200", () => {
  it("passes when every URL returns 200", async () => {
    expect(summary(await check(SMP_007))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a 404 and a redirect", async () => {
    const outcomes = await check(SMP_007, {
      files: { "/sitemap.xml": sitemapXml(["/", "/about/", "/gone/", "/moved/"]) },
      server: { redirects: [{ from: "/moved/", to: "/about/", status: 301 }] },
    });
    expect(summary(outcomes)).toEqual(["pass /", "pass /about/", "fail /gone/", "fail /moved/"]);
  });
});
