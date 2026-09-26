import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { SD_001 } from "./sd-001-valid-json-ld";

describe("SD-001 valid JSON-LD", () => {
  it("passes for valid JSON-LD", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { jsonLd: [{ "@type": "AboutPage", name: "About" }] }),
    };
    expect(summary(await check(SD_001, { pages }))).toEqual(["pass /about/"]);
  });

  it("fails for a syntax error", async () => {
    const head =
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product",,}</script>';
    const pages = { ...defaultPages(), "/about/": page("/about/", { head }) };
    expect(summary(await check(SD_001, { pages }))).toEqual(["fail /about/"]);
  });

  it("fails without @type", async () => {
    const head =
      '<script type="application/ld+json">{"@context":"https://schema.org","name":"X"}</script>';
    const pages = { ...defaultPages(), "/about/": page("/about/", { head }) };
    expect(summary(await check(SD_001, { pages }))).toEqual(["fail /about/"]);
  });
});
