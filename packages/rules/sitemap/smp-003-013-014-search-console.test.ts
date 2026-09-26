import { describe, expect, it } from "vitest";
import { ORIGIN, check, summary } from "../src/testing";
import { SMP_003 } from "./smp-003-submitted-in-gsc";
import { SMP_013 } from "./smp-013-gsc-errors";
import { SMP_014 } from "./smp-014-listed-not-indexed";

const sitemap = { path: `${ORIGIN}/sitemap.xml`, errors: 0, warnings: 0, isSitemapsIndex: false, lastDownloaded: null };
const inspection = (path: string, verdict: string, coverageState: string) => ({
  url: `${ORIGIN}${path}`,
  verdict,
  coverageState,
  inspectedAt: "2026-09-24T02:00:00Z",
});

describe("Search Console sitemap rules", () => {
  it("are not applicable without a Search Console connection", async () => {
    for (const rule of [SMP_003, SMP_013, SMP_014]) {
      expect(summary(await check(rule))).toEqual(["na site"]);
    }
  });

  it("SMP-003 passes when the sitemap is submitted and fails when it is not", async () => {
    expect(summary(await check(SMP_003, { gsc: { sitemaps: [sitemap] } }))).toEqual(["pass /sitemap.xml"]);
    expect(summary(await check(SMP_003, { gsc: { sitemaps: [] } }))).toEqual(["fail /sitemap.xml"]);
  });

  it("SMP-013 fails when Search Console reports errors or warnings", async () => {
    expect(summary(await check(SMP_013, { gsc: { sitemaps: [sitemap] } }))).toEqual(["pass /sitemap.xml"]);
    expect(summary(await check(SMP_013, { gsc: { sitemaps: [{ ...sitemap, warnings: 3 }] } }))).toEqual(["fail /sitemap.xml"]);
  });

  it("SMP-014 checks inspected sitemap URLs only", async () => {
    const outcomes = await check(SMP_014, {
      gsc: { inspections: [inspection("/", "PASS", "Submitted and indexed"), inspection("/about/", "NEUTRAL", "Crawled - currently not indexed")] },
    });
    expect(summary(outcomes)).toEqual(["pass /", "fail /about/"]);
    const partial = await check(SMP_014, { gsc: { inspections: [inspection("/", "PASS", "Submitted and indexed")] } });
    expect(summary(partial)).toEqual(["pass /"]);
  });
});
