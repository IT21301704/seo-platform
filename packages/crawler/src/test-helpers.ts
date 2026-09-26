import { fileURLToPath } from "node:url";
import { crawlSite } from "./crawl";
import { loadFixtureSite } from "./memory-fetcher";
import type { CrawlSnapshot } from "./types";

export const FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));

export function fixtureDir(name: string): string {
  return name === "golden-site"
    ? `${FIXTURES_DIR}/golden-site`
    : `${FIXTURES_DIR}/broken-sites/${name}`;
}

export async function crawlFixture(name: string, pageLimit = 1000): Promise<CrawlSnapshot> {
  const site = loadFixtureSite(fixtureDir(name));
  return crawlSite({
    rootUrl: site.server.origin,
    fetcher: site.fetcher,
    pageLimit,
    crawledAt: site.server.crawledAt,
  });
}
