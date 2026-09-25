import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { IDX_003 } from "./idx-003-important-noindex";

describe("IDX-003 important pages noindex", () => {
  it("passes when important pages are indexable", async () => {
    expect(summary(await check(IDX_003))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a noindex navigation page", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { robots: "noindex, follow" }) };
    expect(summary(await check(IDX_003, { pages }))).toEqual(["pass /", "fail /about/"]);
  });

  it("ignores noindex on pages that are only linked from the footer", async () => {
    const pages = {
      "/": page("/", { nav: ["/about/"] }).replace("<footer>", '<footer><a href="/terms/">Terms</a>'),
      "/about/": page("/about/"),
      "/terms/": page("/terms/", { robots: "noindex" }),
    };
    expect(summary(await check(IDX_003, { pages }))).toEqual(["pass /", "pass /about/"]);
  });
});
