import { createHash } from "node:crypto";
import { stableStringify } from "@seo/shared";
import type { CrawlSnapshot } from "./types";

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Fingerprint of everything the rules see. Uses the crawl *date* (not time) so an unchanged
 * site crawled twice on the same day returns the cached report.
 */
export function snapshotSetHash(snapshot: CrawlSnapshot): string {
  const { crawledAt, ...rest } = snapshot;
  return sha256(stableStringify({ ...rest, crawlDate: crawledAt.slice(0, 10) }));
}
