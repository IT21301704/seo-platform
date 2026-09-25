/** Resolves href against base and normalises it; returns null for non-http(s) or invalid URLs. */
export function normalizeUrl(href: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(href.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.username = "";
  url.password = "";
  return url.toString();
}

export function originOf(url: string): string {
  return new URL(url).origin;
}

export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** "https://example-store.com/about/" → "/about/" (keeps the query string). */
export function pathOf(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

/** Sorted, de-duplicated copy. */
export function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}
