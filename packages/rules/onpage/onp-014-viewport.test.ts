import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_014 } from "./onp-014-viewport";

describe("ONP-014 viewport", () => {
  it("passes with width=device-width", async () => {
    expect(summary(await check(ONP_014))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails without a viewport", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { viewport: null }) };
    expect(summary(await check(ONP_014, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
