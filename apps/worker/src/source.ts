// Where audit pages come from: an uploaded ZIP, a dev fixture, or the live site.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  HttpFetcher,
  NO_PERFORMANCE,
  PsiPerformance,
  RecordedPerformance,
  loadFixtureSite,
} from "@seo/crawler";
import type { Fetcher, PerformanceSource } from "@seo/crawler";
import { codeFetcher, readZip } from "./code-upload";
import { uploadKey } from "./storage";
import type { BlobStore } from "./storage";

/**
 * The repository fixtures/ folder, found by walking up from the working directory. (Not
 * `new URL(..., import.meta.url)`: the web app bundles this module and Turbopack would treat it
 * as an asset.)
 */
export function fixturesDir(from: string = process.cwd()): string {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "fixtures", "golden-site"))) return join(dir, "fixtures");
    if (dirname(dir) === dir) throw new Error("fixtures/ folder not found");
  }
}

export interface Source {
  fetcher: Fetcher;
  performance: PerformanceSource;
  crawledAt: string;
  cleanup: () => Promise<void>;
}

export interface SourceDeps {
  blobs: BlobStore;
  now: () => Date;
  /** Dev/seed only: crawl this fixture folder instead of the network. */
  fixture?: { name: string; crawledAt?: string };
}

/** The fixture served for a project in local development (FIXTURE_SITES=true), or null. */
export function fixtureNameFor(rootUrl: string, deps: Pick<SourceDeps, "fixture">): string | null {
  if (deps.fixture) return deps.fixture.name;
  return process.env["FIXTURE_SITES"] === "true" &&
    new URL(rootUrl).hostname === "example-store.com"
    ? (process.env["FIXTURE_SITE_NAME"] ?? "golden-site")
    : null;
}

export function fixtureDir(name: string): string {
  return name === "golden-site"
    ? join(fixturesDir(), "golden-site")
    : join(fixturesDir(), "broken-sites", name);
}

export async function sourceFor(
  crawl: { id: string; inputType: "url" | "code"; organizationId: string },
  project: { rootUrl: string },
  deps: SourceDeps,
): Promise<Source> {
  const now = deps.now().toISOString();
  if (crawl.inputType === "code") {
    const key = uploadKey(crawl.organizationId, crawl.id);
    const zip = await deps.blobs.get(key);
    if (!zip) throw new Error("Uploaded code not found");
    const files = await readZip(zip);
    // Uploaded code is deleted as soon as the audit has read it (retention).
    return {
      fetcher: codeFetcher(files, new URL(project.rootUrl).origin),
      performance: NO_PERFORMANCE,
      crawledAt: now,
      cleanup: () => deps.blobs.delete(key),
    };
  }
  const fixtureName = fixtureNameFor(project.rootUrl, deps);
  if (fixtureName) {
    const site = loadFixtureSite(fixtureDir(fixtureName));
    return {
      fetcher: site.fetcher,
      performance: new RecordedPerformance(site.server.performance),
      crawledAt: deps.fixture?.crawledAt ?? site.server.crawledAt,
      cleanup: async () => undefined,
    };
  }
  const fetcher = new HttpFetcher();
  const psiKey = process.env["PSI_API_KEY"];
  return {
    fetcher,
    performance: psiKey
      ? new PsiPerformance(psiKey, new HttpFetcher({ requestsPerSecond: 1, timeoutMs: 90_000 }))
      : NO_PERFORMANCE,
    crawledAt: now,
    cleanup: () => fetcher.close(),
  };
}
