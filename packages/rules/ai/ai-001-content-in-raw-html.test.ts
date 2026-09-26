import { describe, expect, it } from "vitest";
import { evaluateRule } from "../src/engine";
import { defaultPages, miniSite, page, summary } from "../src/testing";
import { AI_001 } from "./ai-001-content-in-raw-html";

describe("AI-001 content in raw HTML", () => {
  it("passes when content is in the served HTML", async () => {
    expect(summary(evaluateRule(AI_001, await miniSite()))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails when most text is only in the rendered HTML", async () => {
    const shell = page("/about/", { body: '<div id="app"></div><script src="/app.js"></script>' });
    const site = await miniSite({ pages: { ...defaultPages(), "/about/": shell } });
    const about = site.pageByUrl.get("https://example-store.com/about/");
    if (!about?.raw) throw new Error("missing page");
    // Simulate the rendered result (the Playwright renderer is covered by crawler tests).
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    about.rendered = {
      ...about.raw,
      wordCount: about.raw.wordCount + 120,
      mainText: `${about.raw.mainText} ${words}`,
    };
    about.facts = about.rendered;
    expect(summary(evaluateRule(AI_001, site))).toEqual(["pass /", "fail /about/"]);
  });
});
