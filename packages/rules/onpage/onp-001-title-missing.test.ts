import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_001 } from "./onp-001-title-missing";

describe("ONP-001 title missing", () => {
  it("passes when pages have titles", async () => {
    expect(summary(await check(ONP_001))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a page without a title", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { title: null }) };
    expect(summary(await check(ONP_001, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
