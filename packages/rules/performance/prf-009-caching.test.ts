import { describe, expect, it } from "vitest";
import { check, summary } from "../src/testing";
import { PRF_009 } from "./prf-009-caching";

describe("PRF-009 caching headers", () => {
  it("passes with Cache-Control", async () => {
    expect(summary(await check(PRF_009))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails with no-store and no validators", async () => {
    const outcomes = await check(PRF_009, { server: { headers: { "cache-control": "no-store" } } });
    expect(summary(outcomes)).toEqual(["fail /", "fail /about/"]);
  });
});
