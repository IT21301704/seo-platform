import { describe, expect, it } from "vitest";
import { check, summary } from "../src/testing";
import { PRF_008 } from "./prf-008-compression";

describe("PRF-008 compression", () => {
  it("passes for Brotli", async () => {
    expect(summary(await check(PRF_008))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails without compression", async () => {
    expect(summary(await check(PRF_008, { server: { compression: "none" } }))).toEqual(["fail /", "fail /about/"]);
  });

  it("is not applicable to code uploads", async () => {
    expect(summary(await check(PRF_008, { inputType: "code" }))).toEqual(["na site"]);
  });
});
