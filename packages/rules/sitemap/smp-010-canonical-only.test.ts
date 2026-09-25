import { describe, expect, it } from "vitest";
import { ORIGIN, check, defaultPages, page, summary } from "../src/testing";
import { SMP_010 } from "./smp-010-canonical-only";

describe("SMP-010 only canonical URLs in sitemap", () => {
  it("passes for self-canonical pages", async () => {
    expect(summary(await check(SMP_010))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a listed page canonicalised elsewhere", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { canonical: `${ORIGIN}/` }) };
    expect(summary(await check(SMP_010, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
