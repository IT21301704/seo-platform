import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_012 } from "./onp-012-twitter-card";

describe("ONP-012 Twitter card", () => {
  it("passes with twitter:card and OG fallbacks", async () => {
    expect(summary(await check(ONP_012))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails without a card", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { og: false }) };
    expect(summary(await check(ONP_012, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
