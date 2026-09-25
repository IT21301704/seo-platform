import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { PRF_004 } from "./prf-004-page-weight";

describe("PRF-004 page weight", () => {
  it("passes for small pages", async () => {
    expect(summary(await check(PRF_004))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for HTML over 500 KB", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { body: `<p>${"x".repeat(520 * 1024)}</p>` }) };
    expect(summary(await check(PRF_004, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
