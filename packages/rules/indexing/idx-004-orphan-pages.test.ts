import { describe, expect, it } from "vitest";
import { check, defaultPages, page, sitemapXml, summary } from "../src/testing";
import { IDX_004 } from "./idx-004-orphan-pages";

describe("IDX-004 orphan pages", () => {
  it("passes when sitemap pages are linked", async () => {
    expect(summary(await check(IDX_004))).toEqual(["pass /about/"]);
  });

  it("fails for a sitemap page nothing links to", async () => {
    const pages = { ...defaultPages(), "/hidden/": page("/hidden/") };
    const outcomes = await check(IDX_004, {
      pages,
      files: { "/sitemap.xml": sitemapXml(["/", "/about/", "/hidden/"]) },
    });
    expect(summary(outcomes)).toEqual(["pass /about/", "fail /hidden/"]);
  });
});
