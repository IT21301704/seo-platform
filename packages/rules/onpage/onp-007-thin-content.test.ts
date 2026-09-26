import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_007 } from "./onp-007-thin-content";

describe("ONP-007 thin content", () => {
  it("passes for pages with enough text", async () => {
    expect(summary(await check(ONP_007))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a near-empty page", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { body: "<p>Coming soon.</p>" }),
    };
    expect(summary(await check(ONP_007, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
