import { describe, expect, it } from "vitest";
import { ORIGIN, check, defaultPages, page, summary } from "../src/testing";
import { SD_005 } from "./sd-005-breadcrumb-list";

const crumbs = (items: object[]) => ({ "@type": "BreadcrumbList", itemListElement: items });

describe("SD-005 BreadcrumbList", () => {
  it("passes for a valid list", async () => {
    const jsonLd = [
      crumbs([
        { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: "About" },
      ]),
    ];
    const pages = { ...defaultPages(), "/about/": page("/about/", { jsonLd }) };
    expect(summary(await check(SD_005, { pages }))).toEqual(["pass /about/"]);
  });

  it("fails for wrong positions and a missing URL", async () => {
    const jsonLd = [
      crumbs([
        { "@type": "ListItem", position: 2, name: "Home" },
        { "@type": "ListItem", position: 3, name: "About" },
      ]),
    ];
    const pages = { ...defaultPages(), "/about/": page("/about/", { jsonLd }) };
    const outcomes = await check(SD_005, { pages });
    expect(summary(outcomes)).toEqual(["fail /about/"]);
    expect(outcomes[0]?.evidence["problems"]).toContain("item 1: missing absolute URL");
  });
});
