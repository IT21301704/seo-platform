import { describe, expect, it } from "vitest";
import { check, page, summary } from "../src/testing";
import { IDX_005 } from "./idx-005-duplicate-content";

describe("IDX-005 duplicate content", () => {
  it("passes for pages with different content", async () => {
    expect(summary(await check(IDX_005))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for two pages with the same main content", async () => {
    const same = { h1: "Same heading", body: "<p>Exactly the same words on both pages.</p>" };
    const pages = {
      "/": page("/", { nav: ["/a/", "/b/"] }),
      "/a/": page("/a/", same).replace('<nav aria-label="Breadcrumb"><a href="/">Home</a> / a</nav>', ""),
      "/b/": page("/b/", same).replace('<nav aria-label="Breadcrumb"><a href="/">Home</a> / b</nav>', ""),
    };
    expect(summary(await check(IDX_005, { pages }))).toEqual(["pass /", "fail /a/", "fail /b/"]);
  });
});
