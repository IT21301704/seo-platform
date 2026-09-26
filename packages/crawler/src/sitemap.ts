import { XMLParser, XMLValidator } from "fast-xml-parser";

export const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
  /** xhtml:link alternates (hreflang) listed for this URL. */
  alternates: { hreflang: string; href: string }[];
  images: string[];
  videos: { thumbnail: string | null; title: string | null; contentLoc: string | null }[];
}

export interface ParsedSitemap {
  kind: "urlset" | "sitemapindex" | "invalid";
  /** Well-formed XML. */
  wellFormed: boolean;
  namespaceOk: boolean;
  /** Human-readable problems with the file itself. */
  errors: string[];
  entries: SitemapEntry[];
  /** Child sitemap URLs (sitemap index only). */
  children: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: false,
  isArray: (name) => ["url", "sitemap", "xhtml:link", "image:image", "video:video"].includes(name),
  parseTagValue: false,
  trimValues: true,
});

type XmlNode = Record<string, unknown>;

export function parseSitemap(xml: string): ParsedSitemap {
  const empty = { entries: [], children: [] };
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    return {
      kind: "invalid",
      wellFormed: false,
      namespaceOk: false,
      errors: [`XML error on line ${validation.err.line}: ${validation.err.msg}`],
      ...empty,
    };
  }
  const doc = parser.parse(xml) as XmlNode;
  const urlset = doc["urlset"] as XmlNode | undefined;
  const index = doc["sitemapindex"] as XmlNode | undefined;
  const root = urlset ?? index;
  if (!root || typeof root !== "object") {
    return {
      kind: "invalid",
      wellFormed: true,
      namespaceOk: false,
      errors: ["Root element must be <urlset> or <sitemapindex>"],
      ...empty,
    };
  }
  const namespaceOk = root["@xmlns"] === SITEMAP_NAMESPACE;
  const errors = namespaceOk ? [] : [`Missing or wrong namespace (expected ${SITEMAP_NAMESPACE})`];

  if (index) {
    const children = asNodes(index["sitemap"]).map((s) => text(s["loc"]));
    if (children.some((c) => c === null)) errors.push("A <sitemap> entry has no <loc>");
    return {
      kind: "sitemapindex",
      wellFormed: true,
      namespaceOk,
      errors,
      entries: [],
      children: children.filter((c): c is string => c !== null),
    };
  }

  const entries: SitemapEntry[] = [];
  for (const node of asNodes(root["url"])) {
    const loc = text(node["loc"]);
    if (loc === null) {
      errors.push("A <url> entry has no <loc>");
      continue;
    }
    entries.push({
      loc,
      lastmod: text(node["lastmod"]),
      alternates: asNodes(node["xhtml:link"]).map((l) => ({
        hreflang: String(l["@hreflang"] ?? ""),
        href: String(l["@href"] ?? ""),
      })),
      images: asNodes(node["image:image"])
        .map((i) => text(i["image:loc"]))
        .filter((i): i is string => i !== null),
      videos: asNodes(node["video:video"]).map((v) => ({
        thumbnail: text(v["video:thumbnail_loc"]),
        title: text(v["video:title"]),
        contentLoc: text(v["video:content_loc"]) ?? text(v["video:player_loc"]),
      })),
    });
  }
  return { kind: "urlset", wellFormed: true, namespaceOk, errors, entries, children: [] };
}

function asNodes(value: unknown): XmlNode[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is XmlNode => v !== null && typeof v === "object");
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "#text" in value) {
    return String((value as XmlNode)["#text"]).trim() || null;
  }
  return null;
}

/** W3C Datetime (the formats sitemaps.org allows). */
export function isW3cDate(value: string): boolean {
  return /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/.test(value);
}

/** Which tool generated a sitemap (M17 detection), from its URL and content. */
export function detectSitemapGenerator(url: string, body: string | null): string {
  const text = (body ?? "").slice(0, 4000).toLowerCase();
  const path = new URL(url).pathname.toLowerCase();
  if (text.includes("yoast") || text.includes("main-sitemap.xsl")) return "Yoast SEO";
  if (text.includes("rank-math") || text.includes("rank math")) return "Rank Math";
  if (path.startsWith("/wp-sitemap")) return "WordPress core";
  if (text.includes("shopify") || /sitemap_(products|pages|collections|blogs)_\d/.test(path))
    return "Shopify";
  if (text.includes("webflow")) return "Webflow";
  if (text.includes("next-sitemap") || path.includes("server-sitemap")) return "Next.js";
  return "Static or unknown";
}
