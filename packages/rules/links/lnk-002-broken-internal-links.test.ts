import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { LNK_002 } from "./lnk-002-broken-internal-links";

describe("LNK-002 broken internal links", () => {
  it("passes when every link works", async () => {
    expect(summary(await check(LNK_002))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a link to a 404", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { body: '<p><a href="/old-post/">Old</a></p>' }) };
    const outcomes = await check(LNK_002, { pages });
    expect(summary(outcomes)).toEqual(["pass /", "fail /about/"]);
    expect(outcomes[1]?.evidence["brokenLinks"]).toEqual([{ url: "https://example-store.com/old-post/", status: 404 }]);
  });
});
