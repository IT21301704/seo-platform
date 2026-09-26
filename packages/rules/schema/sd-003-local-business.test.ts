import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { SD_003 } from "./sd-003-local-business";

const store = {
  "@type": "Store",
  name: "Example Store",
  telephone: "+94 91 222 0142",
  address: {
    "@type": "PostalAddress",
    streetAddress: "24 Lighthouse St",
    addressLocality: "Galle",
    addressCountry: "LK",
  },
};

describe("SD-003 LocalBusiness", () => {
  it("passes for a complete Store", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { jsonLd: [store] }) };
    expect(summary(await check(SD_003, { pages }))).toEqual(["pass /about/"]);
  });

  it("fails without telephone", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { jsonLd: [{ ...store, telephone: undefined }] }),
    };
    const outcomes = await check(SD_003, { pages });
    expect(summary(outcomes)).toEqual(["fail /about/"]);
    expect(outcomes[0]?.evidence["missing"]).toEqual(["telephone"]);
  });

  it("is not applicable without LocalBusiness", async () => {
    expect(summary(await check(SD_003))).toEqual(["na site"]);
  });
});
