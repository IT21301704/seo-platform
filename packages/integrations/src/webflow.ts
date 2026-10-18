// Webflow (REQUIREMENTS M13, Phase 4): Data API v2 with a site API token. Changeable: SEO title
// and description of static pages. The API has no noindex, redirect or CMS-item SEO settings, so
// those stay "guide only". Changes go live with a site publish (publish()).
import { ok } from "./http";
import type { JsonHttp } from "./http";
import type { PublishTarget } from "./targets";
import { sameWpValue } from "./wordpress/client";
import type { WpField, WpItem, WpReadResult, WpWriteItem, WpWriteResult } from "./wordpress/client";

const API = "https://api.webflow.com/v2";

export const WEBFLOW_FIELDS: ReadonlySet<WpField> = new Set<WpField>(["title", "description"]);

interface WebflowPage {
  id: string;
  slug: string | null;
  publishedPath?: string | null;
  collectionId?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
}

const normalPath = (p: string): string => `/${p.replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "/");

export class WebflowClient implements PublishTarget {
  readonly kind = "webflow" as const;
  readonly fields = WEBFLOW_FIELDS;
  private pages: WebflowPage[] | null = null;

  constructor(
    private readonly http: JsonHttp,
    private readonly token: string,
    readonly siteId: string,
  ) {}

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    json?: unknown,
    what = path,
  ): Promise<T> {
    return ok(
      await this.http.send<T>({
        method,
        url: `${API}${path}`,
        headers: { authorization: `Bearer ${this.token}`, "accept-version": "2.0.0" },
        ...(json === undefined ? {} : { json }),
      }),
      `Webflow ${what}`,
    );
  }

  private async put(path: string, json: unknown): Promise<void> {
    ok(
      await this.http.send({
        method: "PUT",
        url: `${API}${path}`,
        headers: { authorization: `Bearer ${this.token}`, "accept-version": "2.0.0" },
        json,
      }),
      "Webflow page update",
    );
  }

  /** Static pages of the site (CMS template pages are excluded). */
  async listPages(): Promise<WebflowPage[]> {
    if (this.pages) return this.pages;
    const all: WebflowPage[] = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      const res = await this.call<{ pages: WebflowPage[]; pagination?: { total: number } }>(
        "GET",
        `/sites/${this.siteId}/pages?limit=100&offset=${offset}`,
      );
      all.push(...res.pages);
      if (res.pages.length < 100) break;
    }
    this.pages = all.filter((p) => !p.collectionId);
    return this.pages;
  }

  async pageFor(url: string): Promise<WebflowPage | null> {
    const path = normalPath(new URL(url).pathname);
    const pages = await this.listPages();
    return (
      pages.find((p) => normalPath(p.publishedPath ?? `/${p.slug ?? ""}`) === path) ??
      (path === "/" ? (pages.find((p) => !p.slug || p.slug === "index") ?? null) : null)
    );
  }

  private async readOne({ field, ref }: WpItem): Promise<WpReadResult & { page?: WebflowPage }> {
    if (!this.fields.has(field)) return { value: null, error: "unsupported", resolved: null };
    const page = ref.url ? await this.pageFor(ref.url) : null;
    if (!page) return { value: null, error: "not_found", resolved: null };
    const fresh = await this.call<WebflowPage>("GET", `/pages/${page.id}`);
    const raw = field === "title" ? fresh.seo?.title : fresh.seo?.description;
    return { value: raw ? raw : null, error: null, resolved: `page ${page.id}`, page: fresh };
  }

  async read(items: WpItem[]): Promise<WpReadResult[]> {
    const out: WpReadResult[] = [];
    for (const item of items) {
      const { value, error, resolved } = await this.readOne(item);
      out.push({ value, error, resolved });
    }
    return out;
  }

  async write(items: WpWriteItem[]): Promise<WpWriteResult[]> {
    const out: WpWriteResult[] = [];
    for (const item of items) {
      const current = await this.readOne(item);
      if (current.error || !current.page) {
        out.push({ ok: false, previous: null, error: current.error ?? "not_found" });
        continue;
      }
      if (!sameWpValue(current.value, item.expect)) {
        out.push({ ok: false, previous: current.value, error: "conflict" });
        continue;
      }
      const seo = {
        title: current.page.seo?.title ?? null,
        description: current.page.seo?.description ?? null,
        [item.field === "title" ? "title" : "description"]:
          item.value === null ? "" : String(item.value),
      };
      await this.put(`/pages/${current.page.id}`, { seo });
      out.push({ ok: true, previous: current.value, error: null });
    }
    return out;
  }

  /** Publishes the site (all custom domains and the webflow.io subdomain). */
  async publish(): Promise<void> {
    const domains = await this.call<{ customDomains: { id: string }[] }>(
      "GET",
      `/sites/${this.siteId}/custom_domains`,
    );
    await this.call("POST", `/sites/${this.siteId}/publish`, {
      customDomains: domains.customDomains.map((d) => d.id),
      publishToWebflowSubdomain: true,
    });
  }
}
