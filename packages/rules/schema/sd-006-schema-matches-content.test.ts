import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { SD_006 } from "./sd-006-schema-matches-content";

const faq = (answer: string) => ({
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Do you ship?",
      acceptedAnswer: { "@type": "Answer", text: answer },
    },
  ],
});
const body =
  "<h2>Do you ship?</h2><p>Yes, within two to four working days.</p><p>Price: LKR 4,500</p>";

describe("SD-006 schema matches content", () => {
  it("passes when FAQ and price match the page", async () => {
    const product = { "@type": "Product", name: "Heading for about", offers: { price: "4500.00" } };
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", {
        body,
        jsonLd: [faq("Yes, within two to four working days."), product],
      }),
    };
    expect(summary(await check(SD_006, { pages }))).toEqual(["pass /about/"]);
  });

  it("fails when the FAQ answer differs from the visible text", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { body, jsonLd: [faq("Always next day.")] }),
    };
    expect(summary(await check(SD_006, { pages }))).toEqual(["fail /about/"]);
  });

  it("fails when the offer price is not shown", async () => {
    const product = { "@type": "Product", name: "Heading for about", offers: { price: "9900" } };
    const pages = { ...defaultPages(), "/about/": page("/about/", { body, jsonLd: [product] }) };
    expect(summary(await check(SD_006, { pages }))).toEqual(["fail /about/"]);
  });
});
