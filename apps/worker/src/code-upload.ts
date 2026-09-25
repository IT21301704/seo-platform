// Code-upload analyzer input (REQUIREMENTS M3). Files are read into memory and parsed as text;
// nothing from the upload is ever executed (no rendering, no scripts).
import { posix } from "node:path";
import { MemoryFetcher } from "@seo/crawler";
import type { Fetcher } from "@seo/crawler";
import yauzl from "yauzl";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED = /\.(html?|xml|txt|css|js|json|svg|png|jpe?g|webp|avif|gif|gz)$/i;

/** Extracts a ZIP into a path → bytes map. Rejects path traversal and oversized entries. */
export function readZip(zip: Buffer): Promise<Map<string, Buffer>> {
  if (zip.length > MAX_UPLOAD_BYTES) return Promise.reject(new Error("Upload is larger than 100 MB"));
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zip, { lazyEntries: true, strictFileNames: true }, (err, archive) => {
      if (err || !archive) return reject(err ?? new Error("Invalid ZIP"));
      const files = new Map<string, Buffer>();
      let count = 0;
      archive.on("entry", (entry: yauzl.Entry) => {
        const name = posix.normalize(entry.fileName);
        if (name.endsWith("/") || !ALLOWED.test(name) || name.includes("__MACOSX")) return archive.readEntry();
        if (name.startsWith("..") || posix.isAbsolute(name)) return reject(new Error(`Unsafe path in ZIP: ${entry.fileName}`));
        if (++count > MAX_FILES) return reject(new Error("Too many files in ZIP"));
        if (entry.uncompressedSize > MAX_FILE_BYTES) return archive.readEntry();
        archive.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error("Unreadable ZIP entry"));
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => {
            files.set(`/${name}`, Buffer.concat(chunks));
            archive.readEntry();
          });
          stream.on("error", reject);
        });
      });
      archive.on("end", () => resolve(stripCommonRoot(files)));
      archive.on("error", reject);
      archive.readEntry();
    });
  });
}

/** "/my-site/index.html" → "/index.html" when every file shares one top folder (GitHub ZIPs). */
function stripCommonRoot(files: Map<string, Buffer>): Map<string, Buffer> {
  const paths = [...files.keys()];
  const first = paths[0]?.split("/")[1];
  if (!first || paths.some((p) => p.split("/")[1] !== first) || paths.some((p) => p.split("/").length < 3)) return files;
  if (files.has(`/${first}`)) return files;
  return new Map([...files].map(([p, b]) => [p.slice(first.length + 1), b]));
}

/** Serves uploaded files as if they were the live site at `origin`: 200 if present, 404 if not. */
export function codeFetcher(files: Map<string, Buffer>, origin: string): Fetcher {
  return new MemoryFetcher(files, {
    origin,
    crawledAt: "1970-01-01T00:00:00Z",
    alternateOrigins: [],
    statusOverrides: {},
    redirects: [],
    notFoundFile: "404.html",
    notFoundStatus: 404,
    compression: "none",
    headers: {},
    performance: { lcp: "good", inp: "good", cls: "good" },
    ownerIntent: { aiCrawlers: "allow" },
  });
}
