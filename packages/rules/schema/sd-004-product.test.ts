import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { SD_004 } from "./sd-004-product";

const product = {
  "@type": "Product",
  name: "Blue mug",
  image: "https://example-store.com/images/blue-mug.svg",
  offers: { "@type": "Offer", price: "4500", priceCurrency: "LKR", availability: "https://schema.org/InStock" },
};

describe("SD-004 Product", () => {
  it("passes for a complete Product", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { jsonLd: [product] }) };
    expect(summary(await check(SD_004, { pages }))).toEqual(["pass /about/"]);
  });

  it("fails without offers", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { jsonLd: [{ ...product, offers: undefined }] }) };
    const outcomes = await check(SD_004, { pages });
    expect(summary(outcomes)).toEqual(["fail /about/"]);
    expect(outcomes[0]?.evidence["missing"]).toEqual(["offers"]);
  });

  it("is not applicable when JSON-LD is invalid", async () => {
    const head = '<script type="application/ld+json">{"@type":"Product",,}</script>';
    const pages = { ...defaultPages(), "/about/": page("/about/", { head }) };
    expect(summary(await check(SD_004, { pages }))).toEqual(["na site"]);
  });
});
