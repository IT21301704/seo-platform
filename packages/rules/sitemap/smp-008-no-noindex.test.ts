import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { SMP_008 } from "./smp-008-no-noindex";

describe("SMP-008 no noindex URLs in sitemap", () => {
  it("passes when listed pages are indexable", async () => {
    expect(summary(await check(SMP_008))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a listed noindex page", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { robots: "noindex" }) };
    expect(summary(await check(SMP_008, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
