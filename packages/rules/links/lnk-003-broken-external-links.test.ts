import type { SiteFacts } from "@seo/crawler";
import { describe, expect, it } from "vitest";
import { evaluateRule } from "../src/engine";
import { defaultPages, miniSite, page, summary } from "../src/testing";
import { LNK_003 } from "./lnk-003-broken-external-links";

const EXTERNAL = "https://other.example/article";

async function siteWithExternal(status: number | null): Promise<SiteFacts> {
  const pages = { ...defaultPages(), "/about/": page("/about/", { body: `<p><a href="${EXTERNAL}">Source</a></p>` }) };
  const site = await miniSite({ pages });
  // The mini-site fetcher cannot reach other hosts, so set the checked result directly.
  site.externalLinks.set(EXTERNAL, {
    url: EXTERNAL,
    chain: [],
    finalUrl: EXTERNAL,
    status,
    headers: {},
    contentType: null,
    bodySize: 0,
    error: status === null ? "network: unreachable" : null,
    loop: false,
  });
  return site;
}

describe("LNK-003 broken external links", () => {
  it("passes for a working external link", async () => {
    expect(summary(evaluateRule(LNK_003, await siteWithExternal(200)))).toEqual(["pass /about/"]);
  });

  it("fails for an external 404", async () => {
    expect(summary(evaluateRule(LNK_003, await siteWithExternal(404)))).toEqual(["fail /about/"]);
  });

  it("does not fail on inconclusive responses (403)", async () => {
    expect(summary(evaluateRule(LNK_003, await siteWithExternal(403)))).toEqual(["pass /about/"]);
  });
});
