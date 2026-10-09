// Applies proposed values to a copy of a crawl snapshot, so the rule engine can re-check a draft
// before anyone approves it ("generate → rule re-check → preview", REQUIREMENTS M12).
import { load } from "cheerio";
import type { CheerioAPI } from "cheerio";
import { normalizeUrl } from "@seo/crawler";
import type { CrawlSnapshot, PageRecord, SitemapRecord } from "@seo/crawler";
import type { WpRef, WpValue } from "@seo/integrations";
import type { FixKind } from "./kinds";
import { replaceLink } from "./suggest";

export interface ProposedFix {
  kind: FixKind;
  url: string;
  ref: WpRef;
  value: WpValue;
}

type HtmlPatch = (html: string, page: PageRecord) => string;

function patchHead(html: string, edit: ($: CheerioAPI) => void): string {
  const $ = load(html);
  if ($("head").length === 0) $("html").prepend("<head></head>");
  edit($);
  return $.html();
}

function metaDescription(value: WpValue): HtmlPatch {
  return (html) =>
    patchHead(html, ($) => {
      $("head").find('meta[name="description" i]').remove();
      if (typeof value === "string" && value !== "") {
        $("head").append($("<meta>").attr("name", "description").attr("content", value).toString());
      }
    });
}

function title(value: WpValue): HtmlPatch {
  return (html) =>
    patchHead(html, ($) => {
      $("head").find("title").remove();
      if (typeof value === "string" && value !== "") {
        $("head").append($("<title>").text(value).toString());
      }
    });
}

function canonical(value: WpValue): HtmlPatch {
  return (html) =>
    patchHead(html, ($) => {
      $("head").find('link[rel="canonical" i]').remove();
      if (typeof value === "string" && value !== "") {
        $("head").append($("<link>").attr("rel", "canonical").attr("href", value).toString());
      }
    });
}

const NOINDEX = new Set(["noindex", "none"]);

function stripNoindex(content: string): string {
  return content
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d && !NOINDEX.has(d.toLowerCase()))
    .join(", ");
}

function robots(value: WpValue): HtmlPatch {
  return (html) => {
    const $ = load(html);
    $('meta[name="robots" i], meta[name="googlebot" i]').each((_, el) => {
      const content = $(el).attr("content") ?? "";
      const next = value === false ? stripNoindex(content) : `${content}, noindex`;
      if (next) $(el).attr("content", next);
      else $(el).remove();
    });
    if (value === true && $('meta[name="robots" i]').length === 0) {
      $("head").append('<meta name="robots" content="noindex">');
    }
    return $.html();
  };
}

function imageAlt(src: string, value: WpValue): HtmlPatch {
  return (html, page) => {
    const $ = load(html);
    $("img").each((_, el) => {
      const raw = $(el).attr("src") ?? "";
      const resolved = normalizeUrl(raw, page.url);
      if (raw === src || resolved === src)
        $(el).attr("alt", typeof value === "string" ? value : "");
    });
    return $.html();
  };
}

function link(from: string, value: WpValue): HtmlPatch {
  return (html, page) =>
    typeof value === "string" && value !== ""
      ? replaceLink(html, page.url, from, value).content
      : html;
}

function patchPage(page: PageRecord, patch: HtmlPatch, headers = page.headers): PageRecord {
  return {
    ...page,
    headers,
    rawHtml: page.rawHtml === null ? null : patch(page.rawHtml, page),
    renderedHtml: page.renderedHtml === null ? null : patch(page.renderedHtml, page),
  };
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};
const decodeXml = (s: string): string =>
  s.replace(/&(amp|lt|gt|quot|apos);/g, (e) => XML_ENTITIES[e] ?? e);
const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Removes every <url> entry whose <loc> is `target` from a sitemap body. */
export function removeSitemapEntry(body: string, target: string): string {
  const want = normalizeUrl(target);
  return body.replace(/\s*<url>[\s\S]*?<\/url>/g, (block) => {
    const loc = /<loc>\s*([\s\S]*?)\s*<\/loc>/.exec(block)?.[1];
    return loc && normalizeUrl(decodeXml(loc)) === want ? "" : block;
  });
}

function addSitemapEntry(body: string, target: string): string {
  return body.replace(/<\/urlset>/, `<url><loc>${escapeXml(target)}</loc></url></urlset>`);
}

function patchSitemaps(
  sitemaps: SitemapRecord[],
  edit: (s: SitemapRecord) => string | null,
): SitemapRecord[] {
  return sitemaps.map((s) => {
    if (s.body === null) return s;
    const body = edit(s);
    return body === null ? s : { ...s, body };
  });
}

/** Returns a new snapshot with the proposed values applied. The input is not changed. */
export function simulate(snapshot: CrawlSnapshot, fixes: readonly ProposedFix[]): CrawlSnapshot {
  let pages = snapshot.pages;
  let next: CrawlSnapshot = snapshot;
  const editPage = (url: string, fn: (p: PageRecord) => PageRecord) => {
    pages = pages.map((p) => (p.url === url ? fn(p) : p));
  };

  for (const fix of fixes) {
    switch (fix.kind) {
      case "meta_description":
        editPage(fix.url, (p) => patchPage(p, metaDescription(fix.value)));
        break;
      case "title":
        editPage(fix.url, (p) => patchPage(p, title(fix.value)));
        break;
      case "canonical":
        editPage(fix.url, (p) => patchPage(p, canonical(fix.value)));
        break;
      case "noindex":
        editPage(fix.url, (p) => {
          const tag = p.headers["x-robots-tag"];
          const headers =
            tag === undefined || fix.value !== false
              ? p.headers
              : { ...p.headers, "x-robots-tag": stripNoindex(tag) };
          return patchPage(p, robots(fix.value), headers);
        });
        break;
      case "image_alt":
        if (fix.ref.src) {
          const src = fix.ref.src;
          editPage(fix.url, (p) => patchPage(p, imageAlt(src, fix.value)));
        }
        break;
      case "link":
        if (fix.ref.from) {
          const from = fix.ref.from;
          editPage(fix.url, (p) => patchPage(p, link(from, fix.value)));
        }
        break;
      case "redirect": {
        const value = fix.value as { to: string; status: number } | null;
        const from = fix.ref.from ? new URL(fix.ref.from, snapshot.origin).toString() : null;
        if (!from || !value) break;
        const target = pages.find((p) => p.url === value.to);
        editPage(from, (p) => ({
          ...p,
          chain: [{ url: from, status: value.status, location: value.to }],
          finalUrl: value.to,
          status: target?.status ?? 200,
          rawHtml: null,
          renderedHtml: null,
          loop: false,
        }));
        break;
      }
      case "robots_sitemap": {
        const lines = Array.isArray(fix.value) ? fix.value : [];
        const body =
          next.robots.status === 200 ? (next.robots.body ?? "") : "User-agent: *\nAllow: /\n";
        next = {
          ...next,
          robots: {
            ...next.robots,
            status: 200,
            error: null,
            body: `${body.trimEnd()}\n${lines.join("\n")}\n`,
          },
        };
        break;
      }
      case "sitemap_exclude":
        if (fix.value === true) {
          next = {
            ...next,
            sitemaps: patchSitemaps(next.sitemaps, (s) =>
              removeSitemapEntry(s.body ?? "", fix.url),
            ),
          };
        }
        break;
      case "sitemap_include":
        if (fix.value === false) {
          let added = false;
          next = {
            ...next,
            sitemaps: patchSitemaps(next.sitemaps, (s) => {
              if (added || s.status !== 200 || !/<\/urlset>/.test(s.body ?? "")) return null;
              added = true;
              return addSitemapEntry(s.body ?? "", fix.url);
            }),
          };
        }
        break;
    }
  }
  return { ...next, pages };
}
