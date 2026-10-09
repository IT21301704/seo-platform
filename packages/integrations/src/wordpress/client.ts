// Signed client for the WordPress companion plugin REST API (apps/wp-plugin).
// Routes are called through ?rest_route= so they work with and without pretty permalinks.
import { HttpError, ok } from "../http";
import type { JsonHttp } from "../http";
import { signRequest } from "./signing";

export const PLUGIN_NAMESPACE = "/seo-platform/v1";
/** Bumped when the plugin REST contract changes; the plugin reports the version it speaks. */
export const PLUGIN_API_VERSION = 1;

export type SeoPlugin = "yoast" | "rankmath" | "core";

export interface WpStatus {
  apiVersion: number;
  pluginVersion: string;
  wpVersion: string;
  /** Which plugin generates titles, descriptions, robots and canonicals. */
  seoPlugin: SeoPlugin;
  seoPluginVersion: string | null;
  /** False when the SEO plugin outputs no tags yet (Rank Math before its setup wizard). */
  seoPluginReady: boolean;
  homeUrl: string;
  /** A physical robots.txt file overrides WordPress's virtual one (robots fixes cannot apply). */
  physicalRobotsTxt: boolean;
  /** Which generator serves the XML sitemap. */
  sitemap: "core" | "yoast" | "rankmath" | "none";
}

/**
 * Fields the plugin can read and write (REQUIREMENTS M13). Values:
 * title/description/canonical: string | null · noindex/sitemap_exclude: boolean ·
 * image_alt: string | null · post_content: string · redirect: { to, status } | null ·
 * robots_lines: string[].
 */
export type WpField =
  | "title"
  | "description"
  | "noindex"
  | "canonical"
  | "image_alt"
  | "post_content"
  | "redirect"
  | "robots_lines"
  | "sitemap_exclude";

export type WpValue = string | boolean | string[] | { to: string; status: number } | null;

/** Identifies what a field belongs to: a page URL, an image URL or a redirect source path. */
export interface WpRef {
  url?: string;
  src?: string;
  from?: string;
}

export interface WpItem {
  field: WpField;
  ref: WpRef;
}

export interface WpReadResult {
  value: WpValue;
  /** Null when readable; otherwise why not (not_found, unsupported, ...). */
  error: string | null;
  /** What the plugin resolved the ref to, e.g. "page 12" or "attachment 40". */
  resolved: string | null;
}

export interface WpWriteItem extends WpItem {
  value: WpValue;
  /**
   * The value we believe is current. The plugin refuses the write ("conflict") when the site
   * has a different value, so a stale preview or rollback never overwrites someone's edit.
   */
  expect: WpValue;
}

export interface WpWriteResult {
  ok: boolean;
  previous: WpValue;
  error: string | null;
}

export interface WordPressConnection {
  /** Site home URL, e.g. https://example-store.com/ */
  siteUrl: string;
  keyId: string;
  secret: string;
}

export class WordPressClient {
  constructor(
    private readonly http: JsonHttp,
    private readonly connection: WordPressConnection,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async call<T>(method: "GET" | "POST", name: string, payload?: unknown): Promise<T> {
    const route = `${PLUGIN_NAMESPACE}/${name}`;
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const url = new URL(this.connection.siteUrl);
    url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    url.search = `?rest_route=${encodeURIComponent(route)}`;
    const headers = signRequest(this.connection.secret, {
      keyId: this.connection.keyId,
      method,
      route,
      body,
      now: this.now(),
    });
    const res = await this.http.send<T>({
      method,
      url: url.toString(),
      headers,
      ...(payload === undefined ? {} : { rawJson: body }),
    });
    return ok(res, `WordPress plugin ${name}`);
  }

  status(): Promise<WpStatus> {
    return this.call<WpStatus>("GET", "status");
  }

  async read(items: WpItem[]): Promise<WpReadResult[]> {
    const res = await this.call<{ items: WpReadResult[] }>("POST", "read", { items });
    return checkLength(res.items, items.length, "read");
  }

  async write(items: WpWriteItem[]): Promise<WpWriteResult[]> {
    const res = await this.call<{ items: WpWriteResult[] }>("POST", "write", { items });
    return checkLength(res.items, items.length, "write");
  }
}

function checkLength<T>(results: T[] | undefined, expected: number, what: string): T[] {
  if (!Array.isArray(results) || results.length !== expected) {
    throw new HttpError(502, `WordPress plugin ${what}: expected ${expected} results`);
  }
  return results;
}

/** Stable comparison of plugin values (used for conflict checks in tests and the worker). */
export function sameWpValue(a: WpValue, b: WpValue): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
