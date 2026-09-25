import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { LNK_005 } from "./lnk-005-anchor-text";

describe("LNK-005 anchor text", () => {
  it("passes for descriptive links, including image links with alt text", async () => {
    const body = '<p><a href="/"><img src="/logo.svg" alt="Example Store home"></a></p>';
    const pages = { ...defaultPages(), "/about/": page("/about/", { body }) };
    expect(summary(await check(LNK_005, { pages }))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for 'click here' and empty links", async () => {
    const body = '<p><a href="/">Click here</a> <a href="/"><img src="/x.svg"></a></p>';
    const pages = { ...defaultPages(), "/about/": page("/about/", { body }) };
    const outcomes = await check(LNK_005, { pages });
    expect(summary(outcomes)).toEqual(["pass /", "fail /about/"]);
    expect(outcomes[1]?.evidence["links"]).toHaveLength(2);
  });
});
