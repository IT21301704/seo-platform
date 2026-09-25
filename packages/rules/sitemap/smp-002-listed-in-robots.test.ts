import { describe, expect, it } from "vitest";
import { check, summary } from "../src/testing";
import { SMP_002 } from "./smp-002-listed-in-robots";

describe("SMP-002 sitemap in robots.txt", () => {
  it("passes with a Sitemap: line", async () => {
    expect(summary(await check(SMP_002))).toEqual(["pass site"]);
  });

  it("fails without one", async () => {
    expect(summary(await check(SMP_002, { files: { "/robots.txt": "User-agent: *\nAllow: /\n" } }))).toEqual(["fail site"]);
  });
});
