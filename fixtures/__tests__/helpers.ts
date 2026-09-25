import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { FixtureExpectationSchema, FixtureServerSchema } from "@seo/shared";
import type { FixtureExpectation, FixtureServer } from "@seo/shared";

export const FIXTURES_DIR = fileURLToPath(new URL("..", import.meta.url));
export const GOLDEN_DIR = join(FIXTURES_DIR, "golden-site");
export const BROKEN_DIR = join(FIXTURES_DIR, "broken-sites");
export const EXPECTED_DIR = join(FIXTURES_DIR, "expected");

/** All files under dir as sorted POSIX paths relative to dir. */
export function listFiles(base: string, dir: string = base): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(base, full));
    else out.push(relative(base, full).split("\\").join("/"));
  }
  return out.sort();
}

export function brokenSiteNames(): string[] {
  return readdirSync(BROKEN_DIR)
    .filter((n) => statSync(join(BROKEN_DIR, n)).isDirectory())
    .sort();
}

export function siteDir(fixture: string): string {
  return fixture === "golden-site" ? GOLDEN_DIR : join(BROKEN_DIR, fixture);
}

export function readExpectation(fixture: string): FixtureExpectation {
  const raw: unknown = JSON.parse(readFileSync(join(EXPECTED_DIR, `${fixture}.json`), "utf8"));
  return FixtureExpectationSchema.parse(raw);
}

export function readFixtureServer(dir: string): FixtureServer {
  const raw: unknown = JSON.parse(readFileSync(join(dir, "_fixture.json"), "utf8"));
  return FixtureServerSchema.parse(raw);
}

/** Maps an HTML file path to its public URL path: "about/index.html" → "/about/". */
export function fileToUrlPath(file: string): string {
  return file === "index.html" ? "/" : `/${file.replace(/index\.html$/, "")}`;
}

/** Indexable HTML pages of a site (every index.html; 404.html is excluded). */
export function htmlPages(dir: string): { file: string; path: string; html: string }[] {
  return listFiles(dir)
    .filter((f) => f.endsWith("index.html"))
    .map((file) => ({
      file,
      path: fileToUrlPath(file),
      html: readFileSync(join(dir, file), "utf8"),
    }));
}

/** SHA-256 over every file (path + bytes), in sorted order. */
export function hashSite(dir: string): string {
  const hash = createHash("sha256");
  for (const file of listFiles(dir)) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(dir, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
