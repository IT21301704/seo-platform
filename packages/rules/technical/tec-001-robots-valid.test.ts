import { describe, expect, it } from "vitest";
import { DEFAULT_ROBOTS, check, summary } from "../src/testing";
import { TEC_001 } from "./tec-001-robots-valid";

describe("TEC-001 robots.txt valid", () => {
  it("passes with a valid robots.txt", async () => {
    expect(summary(await check(TEC_001))).toEqual(["pass /robots.txt"]);
  });

  it("passes without a robots.txt (404)", async () => {
    expect(summary(await check(TEC_001, { files: { "/robots.txt": null } }))).toEqual([
      "pass /robots.txt",
    ]);
  });

  it("fails on unknown directives", async () => {
    const outcomes = await check(TEC_001, {
      files: { "/robots.txt": `${DEFAULT_ROBOTS}Disalow: /private/\n` },
    });
    expect(summary(outcomes)).toEqual(["fail /robots.txt"]);
    expect(outcomes[0]?.evidence["invalidLines"]).toEqual([5]);
  });

  it("fails when robots.txt returns a server error", async () => {
    const outcomes = await check(TEC_001, { server: { statusOverrides: { "/robots.txt": 503 } } });
    expect(summary(outcomes)).toEqual(["fail /robots.txt"]);
  });
});
