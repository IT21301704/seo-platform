// Shopify app (REQUIREMENTS M13, Phase 4): OAuth install, signed webhooks and the Admin GraphQL
// API. Changeable: SEO title/description (global.title_tag / description_tag metafields), "hide
// from search engines" (seo.hidden — also removes the URL from Shopify's generated sitemap) and URL
// redirects. robots.txt.liquid lives in the theme: guide only. The sitemap itself cannot be edited.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ok } from "./http";
import type { JsonHttp } from "./http";
import type { PublishTarget } from "./targets";
import { sameWpValue } from "./wordpress/client";
import type {
  WpField,
  WpItem,
  WpReadResult,
  WpRef,
  WpValue,
  WpWriteItem,
  WpWriteResult,
} from "./wordpress/client";

export const SHOPIFY_API_VERSION = "2025-07";
/** Least privilege for the fields above. */
export const SHOPIFY_SCOPES = [
  "read_products",
  "write_products",
  "read_content",
  "write_content",
  "read_online_store_pages",
  "write_online_store_pages",
  "read_online_store_navigation",
  "write_online_store_navigation",
];

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
export const isShopDomain = (shop: string): boolean => SHOP_DOMAIN.test(shop);

export interface ShopifyAppConfig {
  apiKey: string;
  apiSecret: string;
}

export function shopifyConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ShopifyAppConfig | null {
  const apiKey = env["SHOPIFY_API_KEY"];
  const apiSecret = env["SHOPIFY_API_SECRET"];
  return apiKey && apiSecret ? { apiKey, apiSecret } : null;
}

export function shopifyInstallUrl(
  config: ShopifyAppConfig,
  shop: string,
  redirectUri: string,
  state: string,
): string {
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", config.apiKey);
  url.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

/** OAuth callback / app URL query check: HMAC-SHA256 (hex) of the sorted query without "hmac". */
export function verifyShopifyQuery(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get("hmac") ?? "";
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  return (
    hmac.length === expected.length && timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))
  );
}

/** Webhook check: base64 HMAC-SHA256 of the raw body (X-Shopify-Hmac-Sha256). */
export function verifyShopifyWebhook(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return (
    header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  );
}

export async function exchangeShopifyCode(
  http: JsonHttp,
  config: ShopifyAppConfig,
  shop: string,
  code: string,
): Promise<{ accessToken: string; scope: string }> {
  const body = ok(
    await http.send<{ access_token: string; scope: string }>({
      method: "POST",
      url: `https://${shop}/admin/oauth/access_token`,
      json: { client_id: config.apiKey, client_secret: config.apiSecret, code },
    }),
    "Shopify token exchange",
  );
  return { accessToken: body.access_token, scope: body.scope };
}

export const SHOPIFY_FIELDS: ReadonlySet<WpField> = new Set<WpField>([
  "title",
  "description",
  "noindex",
  "sitemap_exclude",
  "redirect",
]);

const METAFIELD: Partial<Record<WpField, { namespace: string; key: string; type: string }>> = {
  title: { namespace: "global", key: "title_tag", type: "single_line_text_field" },
  description: { namespace: "global", key: "description_tag", type: "multi_line_text_field" },
  noindex: { namespace: "seo", key: "hidden", type: "number_integer" },
  sitemap_exclude: { namespace: "seo", key: "hidden", type: "number_integer" },
};

/** Storefront URL → resource kind + handle. */
export function shopifyResource(
  url: string,
): { type: "product" | "collection" | "page" | "article"; handle: string } | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  if (parts[0] === "products" && parts[1]) return { type: "product", handle: parts[1] };
  if (parts[0] === "collections" && parts[1] && parts.length === 2)
    return { type: "collection", handle: parts[1] };
  if (parts[0] === "pages" && parts[1]) return { type: "page", handle: parts[1] };
  if (parts[0] === "blogs" && parts[2]) return { type: "article", handle: parts[2] };
  return null;
}

export class ShopifyClient implements PublishTarget {
  readonly kind = "shopify" as const;
  readonly fields = SHOPIFY_FIELDS;

  constructor(
    private readonly http: JsonHttp,
    private readonly shop: string,
    private readonly accessToken: string,
    /** Storefront origin (the project URL): redirect targets are stored as paths by Shopify. */
    private readonly storefrontOrigin: string,
  ) {
    if (!isShopDomain(shop)) throw new Error(`Not a Shopify shop domain: ${shop}`);
  }

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const body = ok(
      await this.http.send<{ data?: T; errors?: { message: string }[] }>({
        method: "POST",
        url: `https://${this.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
        headers: { "x-shopify-access-token": this.accessToken },
        json: { query, variables },
      }),
      "Shopify Admin API",
    );
    if (body.errors?.length || !body.data) {
      throw new Error(`Shopify: ${body.errors?.[0]?.message ?? "no data"}`);
    }
    return body.data;
  }

  /** GraphQL id of the resource behind a storefront URL, or null. */
  async ownerId(url: string): Promise<string | null> {
    const r = shopifyResource(url);
    if (!r) return null;
    if (r.type === "product" || r.type === "collection") {
      const field = r.type === "product" ? "productByIdentifier" : "collectionByIdentifier";
      const data = await this.gql<Record<string, { id: string } | null>>(
        `query($h: String!) { ${field}(identifier: { handle: $h }) { id } }`,
        { h: r.handle },
      );
      return data[field]?.id ?? null;
    }
    const field = r.type === "page" ? "pages" : "articles";
    const data = await this.gql<Record<string, { nodes: { id: string }[] }>>(
      `query($q: String!) { ${field}(first: 1, query: $q) { nodes { id } } }`,
      { q: `handle:${r.handle}` },
    );
    return data[field]?.nodes[0]?.id ?? null;
  }

  private async readMetafield(ownerId: string, field: WpField): Promise<WpValue> {
    const mf = METAFIELD[field];
    if (!mf) return null;
    const data = await this.gql<{ node: { metafield: { value: string } | null } | null }>(
      `query($id: ID!, $ns: String!, $key: String!) { node(id: $id) { ... on HasMetafields { metafield(namespace: $ns, key: $key) { value } } } }`,
      { id: ownerId, ns: mf.namespace, key: mf.key },
    );
    const raw = data.node?.metafield?.value ?? null;
    if (field === "noindex" || field === "sitemap_exclude") return raw === "1";
    return raw === null || raw === "" ? null : raw;
  }

  private async writeMetafield(
    ownerId: string,
    field: WpField,
    value: WpValue,
  ): Promise<string | null> {
    const mf = METAFIELD[field];
    if (!mf) return "unsupported";
    const hidden = field === "noindex" || field === "sitemap_exclude";
    const remove = hidden ? value !== true : value === null || value === "";
    const data = remove
      ? await this.gql<{ metafieldsDelete: { userErrors: { message: string }[] } }>(
          `mutation($m: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $m) { userErrors { message } } }`,
          { m: [{ ownerId, namespace: mf.namespace, key: mf.key }] },
        )
      : await this.gql<{ metafieldsSet: { userErrors: { message: string }[] } }>(
          `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { message } } }`,
          {
            m: [
              {
                ownerId,
                namespace: mf.namespace,
                key: mf.key,
                type: mf.type,
                value: hidden ? "1" : String(value),
              },
            ],
          },
        );
    const errors =
      "metafieldsDelete" in data ? data.metafieldsDelete.userErrors : data.metafieldsSet.userErrors;
    return errors[0]?.message ?? null;
  }

  private async findRedirect(from: string): Promise<{ id: string; target: string } | null> {
    const data = await this.gql<{
      urlRedirects: { nodes: { id: string; path: string; target: string }[] };
    }>(`query($q: String!) { urlRedirects(first: 5, query: $q) { nodes { id path target } } }`, {
      q: `path:'${from.replace(/'/g, "")}'`,
    });
    return data.urlRedirects.nodes.find((n) => n.path === from) ?? null;
  }

  private async readOne({ field, ref }: WpItem): Promise<WpReadResult> {
    if (!this.fields.has(field)) return { value: null, error: "unsupported", resolved: null };
    if (field === "redirect") {
      const r = await this.findRedirect(ref.from ?? "");
      const to = r
        ? r.target.startsWith("/")
          ? `${this.storefrontOrigin}${r.target}`
          : r.target
        : null;
      return {
        value: to ? { to, status: 301 } : null,
        error: null,
        resolved: `redirect ${ref.from}`,
      };
    }
    const owner = ref.url ? await this.ownerId(ref.url) : null;
    if (!owner) return { value: null, error: "not_found", resolved: null };
    return { value: await this.readMetafield(owner, field), error: null, resolved: owner };
  }

  async read(items: WpItem[]): Promise<WpReadResult[]> {
    const out: WpReadResult[] = [];
    for (const item of items) out.push(await this.readOne(item));
    return out;
  }

  /** Read, compare with "expect", then write (Shopify has no conditional write). */
  async write(items: WpWriteItem[]): Promise<WpWriteResult[]> {
    const out: WpWriteResult[] = [];
    for (const item of items) {
      const current = await this.readOne(item);
      if (current.error) {
        out.push({ ok: false, previous: null, error: current.error });
        continue;
      }
      if (!sameWpValue(current.value, item.expect)) {
        out.push({ ok: false, previous: current.value, error: "conflict" });
        continue;
      }
      const error =
        item.field === "redirect"
          ? await this.writeRedirect(item.ref, item.value)
          : await this.writeMetafield(current.resolved ?? "", item.field, item.value);
      out.push({ ok: error === null, previous: current.value, error });
    }
    return out;
  }

  private async writeRedirect(ref: WpRef, value: WpValue): Promise<string | null> {
    const from = ref.from ?? "";
    const existing = await this.findRedirect(from);
    const target = (value as { to?: string } | null)?.to;
    if (!target) {
      if (!existing) return null;
      const data = await this.gql<{ urlRedirectDelete: { userErrors: { message: string }[] } }>(
        `mutation($id: ID!) { urlRedirectDelete(id: $id) { userErrors { message } } }`,
        { id: existing.id },
      );
      return data.urlRedirectDelete.userErrors[0]?.message ?? null;
    }
    // Shopify stores redirect targets as paths for the shop's own URLs.
    const path = target.startsWith("http")
      ? new URL(target).pathname + new URL(target).search
      : target;
    const data = existing
      ? await this.gql<{ urlRedirectUpdate: { userErrors: { message: string }[] } }>(
          `mutation($id: ID!, $r: UrlRedirectInput!) { urlRedirectUpdate(id: $id, urlRedirect: $r) { userErrors { message } } }`,
          { id: existing.id, r: { path: from, target: path } },
        )
      : await this.gql<{ urlRedirectCreate: { userErrors: { message: string }[] } }>(
          `mutation($r: UrlRedirectInput!) { urlRedirectCreate(urlRedirect: $r) { userErrors { message } } }`,
          { r: { path: from, target: path } },
        );
    const errors =
      "urlRedirectUpdate" in data
        ? data.urlRedirectUpdate.userErrors
        : data.urlRedirectCreate.userErrors;
    return errors[0]?.message ?? null;
  }
}
