import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { SD_008 } from "./sd-008-article";

const post = {
  "@type": "BlogPosting",
  headline: "How to care for ceramic mugs",
  datePublished: "2026-08-12",
  author: { "@type": "Organization", name: "Example Store" },
  image: "https://example-store.com/images/mug-care.svg",
};

describe("SD-008 Article", () => {
  it("passes for a complete BlogPosting", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { jsonLd: [post] }) };
    expect(summary(await check(SD_008, { pages }))).toEqual(["pass /about/"]);
  });

  it("fails for a bad date and no author", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { jsonLd: [{ ...post, datePublished: "12 August 2026", author: undefined }] }),
    };
    const outcomes = await check(SD_008, { pages });
    expect(outcomes[0]?.evidence["problems"]).toEqual(["author", "datePublished"]);
  });
});
