import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_013 } from "./onp-013-lang";

describe("ONP-013 lang", () => {
  it("passes for lang=en", async () => {
    expect(summary(await check(ONP_013))).toEqual(["pass /", "pass /about/"]);
  });

  it.each([null, "english"])("fails for lang=%j", async (lang) => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { lang }) };
    expect(summary(await check(ONP_013, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
