import { describe, expect, it } from "vitest";
import { ORIGIN, check, defaultPages, page, summary } from "../src/testing";
import { SD_002 } from "./sd-002-organization";

const org = { "@type": "Organization", name: "Example Store", url: `${ORIGIN}/`, logo: `${ORIGIN}/logo.svg` };

describe("SD-002 Organization", () => {
  it("passes with a complete Organization on the home page", async () => {
    const pages = { ...defaultPages(), "/": page("/", { nav: ["/about/"], jsonLd: [org] }) };
    expect(summary(await check(SD_002, { pages }))).toEqual(["pass /"]);
  });

  it("accepts a LocalBusiness subtype", async () => {
    const store = { ...org, "@type": "Store", logo: undefined, image: `${ORIGIN}/shop.svg` };
    const pages = { ...defaultPages(), "/": page("/", { nav: ["/about/"], jsonLd: [store] }) };
    expect(summary(await check(SD_002, { pages }))).toEqual(["pass /"]);
  });

  it("fails without Organization markup", async () => {
    expect(summary(await check(SD_002))).toEqual(["fail /"]);
  });
});
