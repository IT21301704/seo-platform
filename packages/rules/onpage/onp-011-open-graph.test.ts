import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_011 } from "./onp-011-open-graph";

describe("ONP-011 Open Graph", () => {
  it("passes with the core OG tags", async () => {
    expect(summary(await check(ONP_011))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails without OG tags", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { og: false }) };
    expect(summary(await check(ONP_011, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
