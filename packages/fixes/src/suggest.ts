// Deterministic suggestions (no LLM): alt text from image file names, replacement URLs for
// broken links, and the link rewrite applied to page content.
import { normalizeUrl } from "@seo/crawler";
import type { SiteFacts } from "@seo/crawler";

const CAMERA_NAME = /^(img|dsc|dscn|pxl|photo|image|screenshot|whatsapp)[\s_-]*\d/i;

/**
 * Alt text from a descriptive file name: "/uploads/blue-ceramic-mug-300x200.jpg" → "Blue ceramic
 * mug". Returns null for camera names or hashes, so the owner writes those. The UI says the
 * text comes from the file name and must be checked against the picture.
 */
export function altFromFilename(src: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(new URL(src, "https://x.invalid/").pathname.split("/").pop() ?? "");
  } catch {
    return null;
  }
  if (CAMERA_NAME.test(name)) return null;
  const words = name
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/-(\d+x\d+|scaled|rotated|e\d{10,})$/i, "")
    .split(/[\s_\-.]+/)
    .filter((w) => w && !/^\d+$/.test(w) && !/^[0-9a-f]{8,}$/i.test(w));
  const text = words.join(" ").trim();
  if (text.length < 3) return null;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

const segments = (url: string): string[] => new URL(url).pathname.split("/").filter(Boolean);

function tokens(segment: string | undefined): Set<string> {
  return new Set(
    (segment ?? "")
      .toLowerCase()
      .split(/[-_.]+/)
      .filter(Boolean),
  );
}

/**
 * Best existing page to replace a broken internal link: same last path segment first, then the
 * most shared words in the last segment, then the longest shared path prefix. Null when nothing
 * is similar enough (the owner picks the target).
 */
export function bestReplacement(brokenUrl: string, site: SiteFacts): string | null {
  const broken = segments(brokenUrl);
  const brokenLast = tokens(broken.at(-1));
  let best: { url: string; score: number } | null = null;
  for (const page of site.pages) {
    if (!page.isIndexable || page.url === brokenUrl) continue;
    const segs = segments(page.url);
    const last = tokens(segs.at(-1));
    const shared = [...brokenLast].filter((t) => last.has(t)).length;
    let prefix = 0;
    while (prefix < Math.min(segs.length, broken.length) - 1 && segs[prefix] === broken[prefix]) {
      prefix++;
    }
    const exact = segs.at(-1) !== undefined && segs.at(-1) === broken.at(-1) ? 100 : 0;
    const score = exact + shared * 10 + prefix;
    if (shared === 0 && exact === 0) continue;
    if (!best || score > best.score || (score === best.score && page.url < best.url)) {
      best = { url: page.url, score };
    }
  }
  return best?.url ?? null;
}

/**
 * Replaces every href in `content` that resolves to `brokenUrl` with `replacement`, keeping
 * root-relative links root-relative. Returns the new content and how many links changed.
 */
export function replaceLink(
  content: string,
  pageUrl: string,
  brokenUrl: string,
  replacement: string,
): { content: string; count: number } {
  const target = normalizeUrl(brokenUrl);
  let count = 0;
  const next = content.replace(
    /(\bhref\s*=\s*)(["'])([^"']*)\2/gi,
    (match, prefix: string, quote: string, href: string) => {
      let resolved: string | null;
      try {
        resolved = normalizeUrl(new URL(href.replace(/&amp;/g, "&"), pageUrl).toString());
      } catch {
        return match;
      }
      if (resolved === null || resolved !== target) return match;
      count++;
      const out =
        href.startsWith("/") && !href.startsWith("//") ? pathOnly(replacement) : replacement;
      return `${prefix}${quote}${out}${quote}`;
    },
  );
  return { content: next, count };
}

function pathOnly(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}${u.hash}`;
}
