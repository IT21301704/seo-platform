import { load } from "cheerio";
import { sha256 } from "./hash";
import type { CrawlSnapshot, ProgressListener } from "./types";

/** Renders a page's HTML after JavaScript runs. */
export interface Renderer {
  render(url: string, options: { crawledAt: string }): Promise<string>;
}

const RENDER_WORD_THRESHOLD = 250;
const MAX_RENDERED_PAGES = 50;

/**
 * A page needs rendering when it runs JavaScript and its raw HTML has little visible text
 * (REQUIREMENTS M2: "when raw HTML is missing main content").
 */
export function needsRender(html: string): boolean {
  const $ = load(html);
  const hasScript = $("script")
    .toArray()
    .some((el) => {
      const type = ($(el).attr("type") ?? "").toLowerCase();
      return !["application/ld+json", "application/json", "importmap"].includes(type);
    });
  if (!hasScript) return false;
  $("script, style, noscript, template").remove();
  const words = $("body").text().replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
  return words < RENDER_WORD_THRESHOLD;
}

/**
 * Adds renderedHtml to pages that need it, in URL order. Uploaded code is never rendered:
 * we never execute user-uploaded code (REQUIREMENTS M3).
 */
export async function renderSnapshot(
  snapshot: CrawlSnapshot,
  renderer: Renderer,
  onProgress?: ProgressListener,
): Promise<CrawlSnapshot> {
  if (snapshot.inputType === "code") return snapshot;
  const candidates = snapshot.pages.filter(
    (p) => p.status === 200 && p.chain.length === 0 && p.rawHtml !== null && needsRender(p.rawHtml),
  );
  const toRender = new Set(candidates.slice(0, MAX_RENDERED_PAGES).map((p) => p.url));
  let done = 0;
  const pages = [];
  for (const page of snapshot.pages) {
    if (!toRender.has(page.url)) {
      pages.push(page);
      continue;
    }
    const renderedHtml = await renderer.render(page.url, { crawledAt: snapshot.crawledAt });
    done += 1;
    onProgress?.({
      stage: "render",
      message: `rendered ${new URL(page.url).pathname}`,
      url: page.url,
      done,
      total: toRender.size,
    });
    pages.push({ ...page, renderedHtml, renderedHash: sha256(renderedHtml) });
  }
  return { ...snapshot, pages };
}
