import { describe, expect, it } from "vitest";
import { check, summary } from "../src/testing";
import { TEC_009 } from "./tec-009-real-404";

describe("TEC-009 real 404", () => {
  it("passes when unknown URLs return 404", async () => {
    expect(summary(await check(TEC_009))).toEqual(["pass site"]);
  });

  it("fails for a soft 404 (200)", async () => {
    expect(summary(await check(TEC_009, { server: { notFoundStatus: 200 } }))).toEqual([
      "fail site",
    ]);
  });
});
