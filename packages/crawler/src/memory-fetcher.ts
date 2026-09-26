import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { FixtureServerSchema } from "@seo/shared";
import type { FixtureServer } from "@seo/shared";
import { FetchError } from "./types";
import type { FetchRequest, FetchResponse, Fetcher } from "./types";

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
};

/** A static site held in memory: path ("/about/index.html") → bytes. */
export type SiteFiles = ReadonlyMap<string, Buffer>;

/**
 * Serves a static site with the server behaviour from _fixture.json (redirects, status
 * overrides, 404 handling, headers). Used for fixtures and unit tests: no network, fully
 * deterministic. Any other host fails like an unreachable server.
 */
export class MemoryFetcher implements Fetcher {
  private readonly origin: string;
  private readonly alternates: Set<string>;

  constructor(
    private readonly files: SiteFiles,
    private readonly server: FixtureServer,
  ) {
    this.origin = new URL(server.origin).origin;
    this.alternates = new Set(server.alternateOrigins.map((o) => new URL(o).origin));
  }

  async fetch({ url, method = "GET" }: FetchRequest): Promise<FetchResponse> {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new FetchError("invalid-url", `Invalid URL: ${url}`);
    }
    if (this.alternates.has(target.origin)) {
      return this.respond(target, 301, Buffer.alloc(0), method, {
        location: `${this.origin}${target.pathname}${target.search}`,
      });
    }
    if (target.origin !== this.origin) {
      throw new FetchError("network", `getaddrinfo ENOTFOUND ${target.hostname}`);
    }

    const path = target.pathname;
    const redirect = this.server.redirects.find((r) => r.from === path);
    if (redirect) {
      return this.respond(target, redirect.status, Buffer.alloc(0), method, {
        location: `${this.origin}${redirect.to}`,
      });
    }

    const file = this.resolveFile(path);
    const override = this.server.statusOverrides[path];
    if (file) {
      const body = this.files.get(file) ?? Buffer.alloc(0);
      return this.respond(target, override ?? 200, body, method, contentTypeHeader(file));
    }
    const notFound = this.files.get(`/${this.server.notFoundFile}`) ?? Buffer.from("Not found");
    return this.respond(
      target,
      override ?? this.server.notFoundStatus,
      notFound,
      method,
      contentTypeHeader(this.server.notFoundFile),
    );
  }

  private resolveFile(path: string): string | null {
    const decoded = decodeURIComponent(path);
    if (decoded.includes("..") || decoded.startsWith("/_fixture.json")) return null;
    const candidates = decoded.endsWith("/") ? [`${decoded}index.html`] : [decoded];
    return candidates.find((c) => this.files.has(c)) ?? null;
  }

  private respond(
    target: URL,
    status: number,
    body: Buffer,
    method: "GET" | "HEAD",
    extra: Record<string, string>,
  ): FetchResponse {
    const headers: Record<string, string> = {
      ...this.server.headers,
      ...extra,
      "content-length": String(body.length),
    };
    if (this.server.compression !== "none" && status === 200) {
      headers["content-encoding"] = this.server.compression;
    }
    const sorted = Object.fromEntries(
      Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)),
    );
    return {
      url: target.toString(),
      status,
      headers: sorted,
      body: method === "HEAD" ? Buffer.alloc(0) : body,
      bodySize: body.length,
    };
  }
}

function contentTypeHeader(file: string): Record<string, string> {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  return { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" };
}

/** Reads every file of a directory into memory (keys are "/"-prefixed POSIX paths). */
export function readSiteFiles(dir: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(`/${relative(dir, full).split("\\").join("/")}`, readFileSync(full));
    }
  };
  walk(dir);
  return files;
}

export interface FixtureSite {
  files: Map<string, Buffer>;
  server: FixtureServer;
  fetcher: MemoryFetcher;
}

/** Loads a fixture folder (with its _fixture.json) as a deterministic in-memory site. */
export function loadFixtureSite(dir: string): FixtureSite {
  const files = readSiteFiles(dir);
  const config = files.get("/_fixture.json");
  if (!config) throw new Error(`${dir} has no _fixture.json`);
  const server = FixtureServerSchema.parse(JSON.parse(config.toString("utf8")));
  return { files, server, fetcher: new MemoryFetcher(files, server) };
}
