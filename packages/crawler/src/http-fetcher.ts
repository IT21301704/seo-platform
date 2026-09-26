import { promisify } from "node:util";
import { brotliDecompress, gunzip, inflate } from "node:zlib";
import { Agent, request } from "undici";
import { CRAWLER_USER_AGENT, CRAWL_REQUESTS_PER_SECOND, MAX_PAGE_SIZE_BYTES } from "@seo/shared";
import { assertSafeUrl, guardedLookup } from "./ssrf";
import { FetchError } from "./types";
import type { FetchRequest, FetchResponse, Fetcher } from "./types";

const decoders: Record<string, (buf: Buffer) => Promise<Buffer>> = {
  gzip: promisify(gunzip),
  "x-gzip": promisify(gunzip),
  br: promisify(brotliDecompress),
  deflate: promisify(inflate),
};

export interface HttpFetcherOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxBytes?: number;
  requestsPerSecond?: number;
}

/**
 * Live fetcher: one request per call, no redirect following, SSRF-guarded DNS on every
 * connection, per-host rate limit (default 2 req/s), size and time limits.
 */
export class HttpFetcher implements Fetcher {
  private readonly agent: Agent;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly minIntervalMs: number;
  private readonly nextSlot = new Map<string, number>();

  constructor(options: HttpFetcherOptions = {}) {
    this.userAgent = options.userAgent ?? CRAWLER_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxBytes = options.maxBytes ?? MAX_PAGE_SIZE_BYTES;
    this.minIntervalMs = 1000 / (options.requestsPerSecond ?? CRAWL_REQUESTS_PER_SECOND);
    this.agent = new Agent({
      connect: { lookup: guardedLookup, timeout: this.timeoutMs },
      headersTimeout: this.timeoutMs,
      bodyTimeout: this.timeoutMs,
    });
  }

  async fetch({ url, method = "GET" }: FetchRequest): Promise<FetchResponse> {
    const target = assertSafeUrl(url);
    await this.waitForSlot(target.host);
    try {
      const res = await request(target, {
        method,
        dispatcher: this.agent,
        headers: {
          "user-agent": this.userAgent,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-encoding": "br, gzip, deflate",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const headers = normalizeHeaders(res.headers);
      const encoded = method === "HEAD" ? Buffer.alloc(0) : await this.readBody(res.body);
      const body = await decode(encoded, headers["content-encoding"]);
      const bodySize =
        method === "HEAD" ? Number(headers["content-length"] ?? 0) || 0 : body.length;
      return { url: target.toString(), status: res.statusCode, headers, body, bodySize };
    } catch (error) {
      throw toFetchError(error);
    }
  }

  async close(): Promise<void> {
    await this.agent.close();
  }

  private async readBody(body: AsyncIterable<Buffer>): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of body) {
      size += chunk.length;
      if (size > this.maxBytes)
        throw new FetchError("too-large", `Body over ${this.maxBytes} bytes`);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  private async waitForSlot(host: string): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + this.minIntervalMs);
    if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
  }
}

function normalizeHeaders(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(raw).sort()) {
    const value = raw[key];
    if (value !== undefined)
      out[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

async function decode(body: Buffer, encoding: string | undefined): Promise<Buffer> {
  const decoder = encoding ? decoders[encoding.trim().toLowerCase()] : undefined;
  if (!decoder || body.length === 0) return body;
  try {
    return await decoder(body);
  } catch {
    throw new FetchError("network", `Could not decode ${encoding} body`);
  }
}

function toFetchError(error: unknown): FetchError {
  if (error instanceof FetchError) return error;
  const err = error as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
  const code = err.code ?? err.cause?.code ?? "";
  if (code === "ESSRFBLOCKED") return new FetchError("blocked", err.message);
  if (err.name === "TimeoutError" || code.includes("TIMEOUT")) {
    return new FetchError("timeout", err.message);
  }
  return new FetchError("network", err.message || String(error));
}
