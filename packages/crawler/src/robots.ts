import robotsParser from "robots-parser";

interface RobotsParserResult {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getSitemaps(): string[];
}

/** User-agent tokens we evaluate robots.txt for. */
export const CRAWLER_TOKEN = "SEOPlatformBot";
export const GOOGLEBOT = "Googlebot";
export const AI_CRAWLERS = [
  "Google-Extended",
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "PerplexityBot",
] as const;

const KNOWN_DIRECTIVES = new Set([
  "user-agent",
  "allow",
  "disallow",
  "sitemap",
  "crawl-delay",
  "host",
  "noindex",
  "clean-param",
]);

export interface ParsedRobots {
  /** True when allowed or when there is no robots.txt; robots.txt says nothing = allowed. */
  isAllowed(url: string, userAgent: string): boolean;
  sitemaps: string[];
  /** 1-based line numbers of lines that are not valid directives. */
  invalidLines: number[];
}

export function parseRobots(robotsUrl: string, body: string | null): ParsedRobots {
  if (body === null) return { isAllowed: () => true, sitemaps: [], invalidLines: [] };
  const parsed = (robotsParser as (url: string, txt: string) => RobotsParserResult)(
    robotsUrl,
    body,
  );
  return {
    isAllowed: (url, userAgent) => parsed.isAllowed(url, userAgent) !== false,
    sitemaps: [...new Set(parsed.getSitemaps())].sort(),
    invalidLines: findInvalidLines(body),
  };
}

function findInvalidLines(body: string): number[] {
  const invalid: number[] = [];
  body.split(/\r?\n/).forEach((line, i) => {
    const content = line.replace(/#.*$/, "").trim();
    if (content === "") return;
    const match = /^([A-Za-z-]+)\s*:/.exec(content);
    if (!match?.[1] || !KNOWN_DIRECTIVES.has(match[1].toLowerCase())) invalid.push(i + 1);
  });
  return invalid;
}
