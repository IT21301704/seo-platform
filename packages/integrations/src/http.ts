import { assertSafeUrl, guardedLookup } from "@seo/crawler";
import { Agent, request } from "undici";

export interface JsonRequest {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  /** JSON body, or form fields (sent as application/x-www-form-urlencoded). */
  json?: unknown;
  form?: Record<string, string>;
}

export interface JsonResponse<T = unknown> {
  status: number;
  body: T;
}

/** HTTP client for third-party APIs (Google, Slack, webhooks). */
export interface JsonHttp {
  send<T = unknown>(req: JsonRequest): Promise<JsonResponse<T>>;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const MAX_BODY = 20 * 1024 * 1024;

/**
 * Undici client with the same SSRF guard as the crawler (CLAUDE.md rule 7: every outbound
 * fetch). No redirects are followed.
 */
export class GuardedJsonHttp implements JsonHttp {
  private readonly agent = new Agent({
    connect: { lookup: guardedLookup, timeout: 20_000 },
    headersTimeout: 60_000,
    bodyTimeout: 60_000,
  });

  async send<T = unknown>({
    method,
    url,
    headers = {},
    json,
    form,
  }: JsonRequest): Promise<JsonResponse<T>> {
    const target = assertSafeUrl(url);
    const body = form
      ? new URLSearchParams(form).toString()
      : json === undefined
        ? undefined
        : JSON.stringify(json);
    const res = await request(target, {
      method,
      dispatcher: this.agent,
      headers: {
        accept: "application/json",
        ...(form
          ? { "content-type": "application/x-www-form-urlencoded" }
          : json === undefined
            ? {}
            : { "content-type": "application/json" }),
        ...headers,
      },
      body,
    });
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of res.body) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) throw new HttpError(res.statusCode, "Response too large");
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.statusCode, body: parsed as T };
  }

  async close(): Promise<void> {
    await this.agent.close();
  }
}

/** Throws HttpError unless the response is 2xx. */
export function ok<T>(res: JsonResponse<T>, what: string): T {
  if (res.status < 200 || res.status >= 300) {
    const detail =
      typeof res.body === "object" && res.body !== null
        ? JSON.stringify(res.body).slice(0, 300)
        : String(res.body).slice(0, 300);
    throw new HttpError(res.status, `${what} failed (${res.status}): ${detail}`);
  }
  return res.body;
}
