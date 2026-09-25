import { describe, expect, it } from "vitest";
import { ORIGIN, check, summary } from "../src/testing";
import { SMP_001 } from "./smp-001-sitemap-exists";

describe("SMP-001 sitemap exists", () => {
  it("passes when /sitemap.xml returns 200", async () => {
    expect(summary(await check(SMP_001))).toEqual(["pass site"]);
  });

  it("fails without any sitemap", async () => {
    const files = { "/sitemap.xml": null, "/robots.txt": "User-agent: *\nAllow: /\n" };
    expect(summary(await check(SMP_001, { files }))).toEqual(["fail site"]);
  });

  it("fails when robots.txt lists a sitemap that 404s", async () => {
    const robots = `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap-products.xml\n`;
    expect(summary(await check(SMP_001, { files: { "/robots.txt": robots } }))).toEqual(["fail site"]);
  });
});
