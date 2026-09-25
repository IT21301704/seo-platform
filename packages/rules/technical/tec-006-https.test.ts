import { describe, expect, it } from "vitest";
import { MemoryFetcher, buildSiteFacts, crawlSite } from "@seo/crawler";
import { evaluateRule } from "../src/engine";
import { CRAWLED_AT, check, summary } from "../src/testing";
import { TEC_006 } from "./tec-006-https";

describe("TEC-006 HTTPS", () => {
  it("passes for an https site", async () => {
    expect(summary(await check(TEC_006))).toEqual(["pass /"]);
  });

  it("fails for an http site", async () => {
    const files = new Map([["/index.html", Buffer.from("<html><body>Hi</body></html>")]]);
    const fetcher = new MemoryFetcher(files, {
      origin: "http://plain.test",
      crawledAt: CRAWLED_AT,
      alternateOrigins: [],
      statusOverrides: {},
      redirects: [],
      notFoundFile: "404.html",
      notFoundStatus: 404,
      compression: "none",
      headers: {},
      performance: { lcp: "good", inp: "good", cls: "good" },
      ownerIntent: { aiCrawlers: "allow" },
    });
    const snapshot = await crawlSite({ rootUrl: "http://plain.test", fetcher, pageLimit: 5, crawledAt: CRAWLED_AT });
    const outcomes = evaluateRule(TEC_006, buildSiteFacts(snapshot));
    expect(outcomes.map((o) => o.result)).toEqual(["fail"]);
  });
});
