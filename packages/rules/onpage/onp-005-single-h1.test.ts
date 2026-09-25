import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_005 } from "./onp-005-single-h1";

describe("ONP-005 exactly one H1", () => {
  it("passes for one H1", async () => {
    expect(summary(await check(ONP_005))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for two H1s", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { h1: ["About us", "Washing"] }) };
    expect(summary(await check(ONP_005, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
