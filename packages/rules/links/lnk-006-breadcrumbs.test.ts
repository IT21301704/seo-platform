import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { LNK_006 } from "./lnk-006-breadcrumbs";

describe("LNK-006 breadcrumbs", () => {
  it("passes when inner pages have breadcrumbs", async () => {
    expect(summary(await check(LNK_006))).toEqual(["pass /about/"]);
  });

  it("passes with BreadcrumbList schema only", async () => {
    const html = page("/about/", {
      jsonLd: [{ "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home" }] }],
    }).replace(/<nav aria-label="Breadcrumb">.*?<\/nav>/, "");
    expect(summary(await check(LNK_006, { pages: { ...defaultPages(), "/about/": html } }))).toEqual(["pass /about/"]);
  });

  it("fails for a page without breadcrumbs", async () => {
    const html = page("/about/").replace(/<nav aria-label="Breadcrumb">.*?<\/nav>/, "");
    expect(summary(await check(LNK_006, { pages: { ...defaultPages(), "/about/": html } }))).toEqual(["fail /about/"]);
  });
});
