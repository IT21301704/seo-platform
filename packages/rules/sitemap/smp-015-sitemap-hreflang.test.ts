import { describe, expect, it } from "vitest";
import { ORIGIN, check, sitemapXml, summary } from "../src/testing";
import { SMP_015 } from "./smp-015-sitemap-hreflang";

const link = (lang: string, path: string) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${ORIGIN}${path}"/>`;

describe("SMP-015 sitemap hreflang", () => {
  it("passes for valid alternates including self", async () => {
    const xml = sitemapXml([{ path: "/", extra: link("en", "/") + link("si", "/si/") }]);
    expect(summary(await check(SMP_015, { files: { "/sitemap.xml": xml } }))).toEqual(["pass /"]);
  });

  it("fails without self-reference and with a bad code", async () => {
    const xml = sitemapXml([{ path: "/", extra: link("sinhala", "/si/") }]);
    expect(summary(await check(SMP_015, { files: { "/sitemap.xml": xml } }))).toEqual(["fail /"]);
  });

  it("is not applicable without alternates", async () => {
    expect(summary(await check(SMP_015))).toEqual(["na site"]);
  });
});
