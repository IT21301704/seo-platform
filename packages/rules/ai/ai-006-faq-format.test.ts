import { describe, expect, it } from "vitest";
import { check, page, summary } from "../src/testing";
import { AI_006 } from "./ai-006-faq-format";

const site = (body: string) => ({ pages: { "/": page("/", { nav: ["/faq/"] }), "/faq/": page("/faq/", { body }) } });

describe("AI-006 FAQ format", () => {
  it("passes for question headings with answers", async () => {
    const body = "<h2>Do you ship?</h2><p>Yes.</p><h2>Can I return a mug?</h2><p>Within 14 days.</p>";
    expect(summary(await check(AI_006, site(body)))).toEqual(["pass /faq/"]);
  });

  it("fails for a FAQ page without question headings", async () => {
    expect(summary(await check(AI_006, site("<p>Shipping: yes. Returns: 14 days.</p>")))).toEqual(["fail /faq/"]);
  });

  it("is not applicable without a FAQ page", async () => {
    expect(summary(await check(AI_006))).toEqual(["na site"]);
  });
});
