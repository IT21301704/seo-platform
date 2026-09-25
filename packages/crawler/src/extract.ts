import { load } from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { normalizeUrl } from "./url";

export type LinkRegion = "header" | "main" | "footer" | "nav" | "other";

export interface LinkFact {
  href: string;
  /** Absolute normalised URL, or null for mailto:, tel:, javascript: and invalid hrefs. */
  url: string | null;
  text: string;
  rel: string[];
  region: LinkRegion;
}

export interface ImageFact {
  src: string;
  url: string | null;
  alt: string | null;
  width: string | null;
  height: string | null;
  loading: string | null;
  fetchpriority: string | null;
  inMain: boolean;
}

export interface JsonLdNode {
  [key: string]: unknown;
}

export interface JsonLdBlock {
  ok: boolean;
  error: string | null;
  /** Top-level nodes, with @graph flattened. */
  nodes: JsonLdNode[];
}

export interface ScriptFact {
  src: string | null;
  type: string | null;
  inHead: boolean;
  async: boolean;
  defer: boolean;
}

export interface PageFacts {
  title: string | null;
  titleCount: number;
  metaDescription: string | null;
  metaDescriptionCount: number;
  /** Lower-cased directives from meta robots, meta googlebot and X-Robots-Tag. */
  robotsDirectives: string[];
  canonical: string | null;
  canonicalCount: number;
  lang: string | null;
  viewport: string | null;
  charset: string | null;
  headings: { level: number; text: string }[];
  h1: string[];
  /** Text of <main> (or <body> when there is no <main>), whitespace-collapsed. */
  mainText: string;
  wordCount: number;
  /** All visible body text, whitespace-collapsed (for schema-matches-content checks). */
  bodyText: string;
  images: ImageFact[];
  links: LinkFact[];
  og: Record<string, string>;
  twitter: Record<string, string>;
  jsonLd: JsonLdBlock[];
  hreflang: { lang: string; href: string }[];
  relNext: string | null;
  relPrev: string | null;
  scripts: ScriptFact[];
  hasBreadcrumbNav: boolean;
}

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

export function extractPageFacts(
  html: string,
  pageUrl: string,
  headers: Record<string, string> = {},
): PageFacts {
  const $ = load(html);
  const head = $("head");
  const title = $("title").first();
  const description = $('meta[name="description" i]').first();
  const canonical = $('link[rel~="canonical" i]').first();
  const mainRoot = $("main").length > 0 ? $("main").first() : $("body");
  const mainText = visibleText($, mainRoot);

  return {
    title: title.length ? collapse(title.text()) : null,
    titleCount: $("title").length,
    metaDescription: description.length ? collapse(description.attr("content") ?? "") : null,
    metaDescriptionCount: $('meta[name="description" i]').length,
    robotsDirectives: robotsDirectives($, headers["x-robots-tag"] ?? null),
    canonical: canonical.length ? normalizeUrl(canonical.attr("href") ?? "", pageUrl) : null,
    canonicalCount: $('link[rel~="canonical" i]').length,
    lang: $("html").attr("lang")?.trim() || null,
    viewport: $('meta[name="viewport" i]').attr("content")?.trim() ?? null,
    charset: $("meta[charset]").attr("charset")?.trim().toLowerCase() ?? null,
    headings: $("h1, h2, h3, h4, h5, h6")
      .toArray()
      .map((el) => ({ level: Number(el.tagName.slice(1)), text: collapse($(el).text()) })),
    h1: $("h1")
      .toArray()
      .map((el) => collapse($(el).text())),
    mainText,
    wordCount: mainText === "" ? 0 : mainText.split(" ").length,
    bodyText: visibleText($, $("body")),
    images: $("img")
      .toArray()
      .map((el) => imageFact($, el, pageUrl)),
    links: $("a[href]")
      .toArray()
      .map((el) => linkFact($, el, pageUrl)),
    og: metaMap($, "property", "og:"),
    twitter: metaMap($, "name", "twitter:"),
    jsonLd: $('script[type="application/ld+json" i]')
      .toArray()
      .map((el) => parseJsonLd($(el).text())),
    hreflang: $('link[rel="alternate" i][hreflang]')
      .toArray()
      .map((el) => ({
        lang: ($(el).attr("hreflang") ?? "").trim(),
        href: normalizeUrl($(el).attr("href") ?? "", pageUrl) ?? ($(el).attr("href") ?? ""),
      })),
    relNext: absoluteAttr($, 'link[rel="next" i]', pageUrl),
    relPrev: absoluteAttr($, 'link[rel="prev" i]', pageUrl),
    scripts: $("script")
      .toArray()
      .map((el) => ({
        src: $(el).attr("src") ?? null,
        type: $(el).attr("type")?.toLowerCase() ?? null,
        inHead: head.find(el).length > 0,
        async: $(el).attr("async") !== undefined,
        defer: $(el).attr("defer") !== undefined,
      })),
    hasBreadcrumbNav:
      $('nav[aria-label="breadcrumb" i], [itemtype$="BreadcrumbList"], .breadcrumbs, .breadcrumb')
        .length > 0,
  };
}

function visibleText($: CheerioAPI, root: Cheerio<AnyNode>): string {
  const clone = root.clone();
  clone.find("script, style, noscript, template, svg").remove();
  // Keep words in adjacent block elements apart ("<h2>A</h2><p>B</p>" → "A B").
  clone.find("*").each((_, el) => {
    $(el).append(" ");
  });
  return collapse(clone.text());
}

function robotsDirectives($: CheerioAPI, xRobotsTag: string | null): string[] {
  const values = $('meta[name="robots" i], meta[name="googlebot" i]')
    .toArray()
    .map((el) => $(el).attr("content") ?? "");
  if (xRobotsTag) {
    // "googlebot: noindex" applies to Google; "otherbot: noindex" does not.
    for (const part of xRobotsTag.split(/,(?=\s*[a-z-]+\s*:)/i)) {
      const scoped = /^\s*([a-z-]+)\s*:\s*(.*)$/i.exec(part);
      if (!scoped) values.push(part);
      else if (["googlebot", "all"].includes((scoped[1] ?? "").toLowerCase())) values.push(scoped[2] ?? "");
      else if (/^(max-snippet|max-image-preview|max-video-preview|unavailable_after)$/i.test(scoped[1] ?? "")) {
        values.push(part);
      }
    }
  }
  return [
    ...new Set(
      values
        .flatMap((v) => v.split(","))
        .map((d) => d.trim().toLowerCase().replace(/\s*:\s*/, ":"))
        .filter(Boolean),
    ),
  ].sort();
}

function region($: CheerioAPI, el: Element): LinkRegion {
  const node = $(el);
  if (node.closest("footer").length) return "footer";
  if (node.closest("header").length) return "header";
  if (node.closest("main").length) return "main";
  if (node.closest("nav").length) return "nav";
  return "other";
}

function linkFact($: CheerioAPI, el: Element, pageUrl: string): LinkFact {
  const node = $(el);
  const href = (node.attr("href") ?? "").trim();
  const imgAlt = node
    .find("img[alt]")
    .toArray()
    .map((img) => $(img).attr("alt") ?? "")
    .join(" ");
  return {
    href,
    url: /^(mailto:|tel:|javascript:|data:)/i.test(href) ? null : normalizeUrl(href, pageUrl),
    text: collapse(`${node.text()} ${imgAlt}`),
    rel: (node.attr("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean).sort(),
    region: region($, el),
  };
}

function imageFact($: CheerioAPI, el: Element, pageUrl: string): ImageFact {
  const node = $(el);
  const src = (node.attr("src") ?? "").trim();
  return {
    src,
    url: src ? normalizeUrl(src, pageUrl) : null,
    alt: node.attr("alt") ?? null,
    width: node.attr("width") ?? null,
    height: node.attr("height") ?? null,
    loading: node.attr("loading")?.toLowerCase() ?? null,
    fetchpriority: node.attr("fetchpriority")?.toLowerCase() ?? null,
    inMain: node.closest("main").length > 0,
  };
}

function metaMap($: CheerioAPI, attr: "property" | "name", prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  $(`meta[${attr}^="${prefix}"]`).each((_, el) => {
    const key = $(el).attr(attr) ?? "";
    if (!(key in out)) out[key] = collapse($(el).attr("content") ?? "");
  });
  return out;
}

function absoluteAttr($: CheerioAPI, selector: string, pageUrl: string): string | null {
  const href = $(selector).first().attr("href");
  return href ? normalizeUrl(href, pageUrl) : null;
}

export function parseJsonLd(raw: string): JsonLdBlock {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: (error as Error).message, nodes: [] };
  }
  const roots = Array.isArray(data) ? data : [data];
  const nodes: JsonLdNode[] = [];
  for (const root of roots) {
    if (!root || typeof root !== "object") continue;
    const graph = (root as JsonLdNode)["@graph"];
    if (Array.isArray(graph)) {
      const context = (root as JsonLdNode)["@context"];
      for (const n of graph) {
        if (n && typeof n === "object") nodes.push({ "@context": context, ...(n as JsonLdNode) });
      }
    } else {
      nodes.push(root as JsonLdNode);
    }
  }
  return { ok: true, error: null, nodes };
}

/** Types of a JSON-LD node as an array ("Store" or ["Organization","Store"]). */
export function nodeTypes(node: JsonLdNode): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}
