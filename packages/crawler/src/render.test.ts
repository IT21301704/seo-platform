import { afterAll, describe, expect, it } from "vitest";
import { loadFixtureSite } from "./memory-fetcher";
import { PlaywrightRenderer } from "./playwright-renderer";
import { needsRender, renderSnapshot } from "./render";
import { buildSiteFacts } from "./site-facts";
import { crawlFixture, fixtureDir } from "./test-helpers";

const O = "https://example-store.com";

describe("needsRender", () => {
  it("skips pages without scripts", () => {
    expect(needsRender("<html><body><p>Hi</p></body></html>")).toBe(false);
  });
  it("renders script pages with little text", () => {
    expect(
      needsRender('<html><body><div id="app"></div><script src="/a.js"></script></body></html>'),
    ).toBe(true);
  });
  it("ignores JSON-LD scripts", () => {
    expect(
      needsRender('<html><body><script type="application/ld+json">{}</script></body></html>'),
    ).toBe(false);
  });
});

describe("PlaywrightRenderer", () => {
  const site = loadFixtureSite(fixtureDir("broken-ai"));
  const renderer = new PlaywrightRenderer(site.fetcher);
  afterAll(() => renderer.close());

  it("renders JS-injected FAQ content, deterministically", async () => {
    const snapshot = await crawlFixture("broken-ai");
    const first = await renderSnapshot(snapshot, renderer);
    const second = await renderSnapshot(snapshot, renderer);

    const rendered = first.pages.filter((p) => p.renderedHtml !== null).map((p) => p.url);
    expect(rendered).toEqual([`${O}/faq/`]);
    expect(first.pages.find((p) => p.url === `${O}/faq/`)?.renderedHash).toBe(
      second.pages.find((p) => p.url === `${O}/faq/`)?.renderedHash,
    );

    const faq = buildSiteFacts(first).pageByUrl.get(`${O}/faq/`);
    expect(faq?.raw?.headings.map((h) => h.level)).toEqual([1]);
    expect(faq?.rendered?.headings.filter((h) => h.level === 2)).toHaveLength(6);
  }, 60_000);

  it("never renders uploaded code", async () => {
    const snapshot = { ...(await crawlFixture("broken-ai")), inputType: "code" as const };
    const result = await renderSnapshot(snapshot, renderer);
    expect(result.pages.every((p) => p.renderedHtml === null)).toBe(true);
  });
});
