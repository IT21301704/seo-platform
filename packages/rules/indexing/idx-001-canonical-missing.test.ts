import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { IDX_001 } from "./idx-001-canonical-missing";

describe("IDX-001 canonical missing", () => {
  it("passes when every page has a canonical", async () => {
    expect(summary(await check(IDX_001))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a page without a canonical", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { canonical: null }) };
    expect(summary(await check(IDX_001, { pages }))).toEqual(["pass /", "fail /about/"]);
  });

  it("skips noindex pages", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { canonical: null, robots: "noindex" }),
    };
    expect(summary(await check(IDX_001, { pages }))).toEqual(["pass /"]);
  });
});
