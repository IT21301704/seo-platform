import { describe, expect, it } from "vitest";
import { check, page, summary } from "../src/testing";
import { ONP_010, urlProblems } from "./onp-010-clean-urls";

describe("ONP-010 clean URLs", () => {
  it("accepts clean URLs", () => {
    expect(urlProblems("https://example-store.com/products/blue-ceramic-mug/")).toEqual([]);
  });

  it("lists problems", () => {
    expect(urlProblems("https://example-store.com/Products/blue_mug?id=4")).toEqual([
      "uppercase letters",
      "underscores instead of hyphens",
      "query parameters",
    ]);
  });

  it("passes and fails pages", async () => {
    const pages = { "/": page("/", { nav: ["/Blue_Mug/"] }), "/Blue_Mug/": page("/Blue_Mug/") };
    expect(summary(await check(ONP_010, { pages }))).toEqual(["pass /", "fail /Blue_Mug/"]);
  });
});
