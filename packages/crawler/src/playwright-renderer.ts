import { chromium } from "playwright";
import type { Browser } from "playwright";
import { CRAWLER_USER_AGENT } from "@seo/shared";
import type { Renderer } from "./render";
import type { Fetcher } from "./types";

/** Fixed browser settings so the same page renders the same way every time. */
const VIEWPORT = { width: 412, height: 915 };
const RENDER_WAIT_MS = 500;
const NAVIGATION_TIMEOUT_MS = 20_000;

/**
 * Headless Chromium renderer. Every request the page makes is routed through our Fetcher, so
 * the SSRF guard applies to sub-resources and fixtures render without any network access.
 * Date and Math.random are frozen to the crawl time so scripts cannot make output vary.
 */
export class PlaywrightRenderer implements Renderer {
  private browser: Browser | null = null;

  constructor(private readonly fetcher: Fetcher) {}

  async render(url: string, { crawledAt }: { crawledAt: string }): Promise<string> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: CRAWLER_USER_AGENT,
      javaScriptEnabled: true,
      serviceWorkers: "block",
    });
    try {
      await context.addInitScript(freezeNondeterminism, Date.parse(crawledAt));
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (request.method() !== "GET") return route.abort();
        try {
          const res = await this.fetcher.fetch({ url: request.url(), method: "GET" });
          const headers = { ...res.headers };
          delete headers["content-encoding"];
          delete headers["content-length"];
          await route.fulfill({ status: res.status, headers, body: res.body });
        } catch {
          await route.abort();
        }
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS });
      await page.waitForTimeout(RENDER_WAIT_MS);
      return await page.content();
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  private async getBrowser(): Promise<Browser> {
    this.browser ??= await chromium.launch({ headless: true });
    return this.browser;
  }
}

/** Runs inside the page before any site script. */
function freezeNondeterminism(now: number): void {
  let seed = 42;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args: []) {
      super(...(args.length === 0 ? ([now] as unknown as []) : args));
    }
    static override now(): number {
      return now;
    }
  }
  (globalThis as { Date: DateConstructor }).Date = FixedDate as DateConstructor;
}
