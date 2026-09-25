import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { SD_007 } from "./sd-007-faq-page";

const question = (answer?: object) => ({ "@type": "Question", name: "Do you ship?", acceptedAnswer: answer });

describe("SD-007 FAQPage", () => {
  it("passes for complete questions", async () => {
    const jsonLd = [{ "@type": "FAQPage", mainEntity: [question({ "@type": "Answer", text: "Yes." })] }];
    const pages = { ...defaultPages(), "/about/": page("/about/", { jsonLd }) };
    expect(summary(await check(SD_007, { pages }))).toEqual(["pass /about/"]);
  });

  it("fails for a question without an answer", async () => {
    const jsonLd = [{ "@type": "FAQPage", mainEntity: [question()] }];
    const pages = { ...defaultPages(), "/about/": page("/about/", { jsonLd }) };
    expect(summary(await check(SD_007, { pages }))).toEqual(["fail /about/"]);
  });
});
