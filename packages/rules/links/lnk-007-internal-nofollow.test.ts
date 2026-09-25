import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { LNK_007 } from "./lnk-007-internal-nofollow";

describe("LNK-007 internal nofollow", () => {
  it("passes for followed internal links", async () => {
    expect(summary(await check(LNK_007))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a nofollow internal link", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { body: '<p><a href="/" rel="nofollow">Home page</a></p>' }) };
    expect(summary(await check(LNK_007, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
