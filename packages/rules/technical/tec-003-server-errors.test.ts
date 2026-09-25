import { describe, expect, it } from "vitest";
import { check, summary } from "../src/testing";
import { TEC_003 } from "./tec-003-server-errors";

describe("TEC-003 server errors", () => {
  it("passes when every page responds", async () => {
    expect(summary(await check(TEC_003))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a page returning 500", async () => {
    const outcomes = await check(TEC_003, { server: { statusOverrides: { "/about/": 500 } } });
    expect(summary(outcomes)).toEqual(["pass /", "fail /about/"]);
  });
});
