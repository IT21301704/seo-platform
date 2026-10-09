// Keyword research from Search Console data (REQUIREMENTS M18). Pure and deterministic: the same
// snapshot and map always give the same ideas, quick wins, cannibalization and gaps. Search volume
// and difficulty need a keyword data provider (Phase 4); without one they are shown as "—".

export interface QueryRow {
  query: string;
  page: string;
  /** ISO 3166-1 alpha-3, lower case ("lka"). */
  country: string;
  clicks: number;
  impressions: number;
  position: number;
}

export type Intent = "transactional" | "commercial" | "informational" | "navigational";

export interface PageStat {
  url: string;
  clicks: number;
  impressions: number;
  /** Impression-weighted average position, 1 decimal. */
  position: number;
}

export interface KeywordStat {
  keyword: string;
  intent: Intent;
  clicks: number;
  impressions: number;
  /** Impression-weighted average position across pages, 1 decimal. */
  position: number;
  /** Pages Google showed for this query, most impressions first. */
  pages: PageStat[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const TRANSACTIONAL =
  /\b(buy|order|shop|price|prices|cost|cheap|deal|discount|delivery|for sale|online)\b/;
const INFORMATIONAL =
  /\b(how|what|why|when|where|who|guide|tips|ideas|care|clean|wash|vs|difference|meaning)\b/;
const COMMERCIAL =
  /\b(best|top|review|reviews|compare|comparison|handmade|custom|personalised|personalized|gift|gifts)\b/;

/** Rule-based intent (no LLM, no numbers): brand → navigational, then buy / learn / compare words. */
export function classifyIntent(query: string, brandWords: readonly string[] = []): Intent {
  const q = query.toLowerCase();
  if (brandWords.some((b) => b && q.includes(b.toLowerCase()))) return "navigational";
  if (TRANSACTIONAL.test(q)) return "transactional";
  if (INFORMATIONAL.test(q)) return "informational";
  if (COMMERCIAL.test(q)) return "commercial";
  return "commercial";
}

/** Brand words from the site host: "example-store.com" → ["example store", "example-store"]. */
export function brandWordsFor(rootUrl: string): string[] {
  const host = new URL(rootUrl).hostname.replace(/^www\./, "");
  const name = host.split(".")[0] ?? "";
  return [...new Set([name, name.replace(/[-_]/g, " ")])].filter((w) => w.length >= 3);
}

/** Aggregates query rows into one stat per keyword, optionally for one country. */
export function aggregate(
  rows: readonly QueryRow[],
  options: { country?: string | null; brandWords?: readonly string[] } = {},
): KeywordStat[] {
  const byKeyword = new Map<string, Map<string, { c: number; i: number; pi: number }>>();
  for (const r of rows) {
    if (options.country && r.country !== options.country) continue;
    const pages = byKeyword.get(r.query) ?? new Map();
    const p = pages.get(r.page) ?? { c: 0, i: 0, pi: 0 };
    p.c += r.clicks;
    p.i += r.impressions;
    p.pi += r.position * r.impressions;
    pages.set(r.page, p);
    byKeyword.set(r.query, pages);
  }
  const stats: KeywordStat[] = [];
  for (const [keyword, pages] of byKeyword) {
    const list: PageStat[] = [...pages]
      .map(([url, p]) => ({
        url,
        clicks: p.c,
        impressions: p.i,
        position: p.i ? round1(p.pi / p.i) : 0,
      }))
      .sort((a, b) => b.impressions - a.impressions || a.url.localeCompare(b.url));
    const impressions = list.reduce((n, p) => n + p.impressions, 0);
    const weighted = list.reduce((n, p) => n + p.position * p.impressions, 0);
    stats.push({
      keyword,
      intent: classifyIntent(keyword, options.brandWords),
      clicks: list.reduce((n, p) => n + p.clicks, 0),
      impressions,
      position: impressions ? round1(weighted / impressions) : 0,
      pages: list,
    });
  }
  return stats.sort((a, b) => b.impressions - a.impressions || a.keyword.localeCompare(b.keyword));
}

const STOP = new Set([
  "a",
  "an",
  "and",
  "the",
  "for",
  "to",
  "of",
  "in",
  "on",
  "with",
  "near",
  "me",
  "my",
  "is",
  "are",
  "how",
  "what",
  "why",
  "best",
  "buy",
  "online",
  "cheap",
  "sri",
  "lanka",
]);

const singular = (w: string): string =>
  w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;

/** Significant, singularised words of a phrase. */
export function significantWords(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w))
    .map(singular);
}

/** Keyword ideas for a seed: queries sharing a significant word with it (all queries when empty). */
export function ideasFor(stats: readonly KeywordStat[], seed: string): KeywordStat[] {
  const words = significantWords(seed);
  if (words.length === 0) return [...stats];
  return stats.filter((s) => {
    const own = new Set(significantWords(s.keyword));
    return words.some((w) => own.has(w));
  });
}

export const QUICK_WIN_MIN_POSITION = 5;
export const QUICK_WIN_MAX_POSITION = 20;
export const QUICK_WIN_MIN_IMPRESSIONS = 50;

/** Quick wins: average position 5–20 with high impressions, most impressions first. */
export function quickWins(
  stats: readonly KeywordStat[],
  minImpressions = QUICK_WIN_MIN_IMPRESSIONS,
): KeywordStat[] {
  return stats.filter(
    (s) =>
      s.position >= QUICK_WIN_MIN_POSITION &&
      s.position <= QUICK_WIN_MAX_POSITION &&
      s.impressions >= minImpressions,
  );
}

export interface Cannibalization {
  keyword: string;
  impressions: number;
  pages: PageStat[];
}

/** A page competes for a query when it has at least this share of the query's impressions. */
export const CANNIBAL_MIN_SHARE = 0.1;
export const CANNIBAL_MIN_IMPRESSIONS = 10;

/** KWD-002: two or more pages each get a real share of impressions for the same query. */
export function cannibalization(stats: readonly KeywordStat[]): Cannibalization[] {
  return stats.flatMap((s) => {
    const competing = s.pages.filter(
      (p) =>
        p.impressions >= CANNIBAL_MIN_IMPRESSIONS &&
        p.impressions >= s.impressions * CANNIBAL_MIN_SHARE,
    );
    return competing.length >= 2
      ? [{ keyword: s.keyword, impressions: s.impressions, pages: competing }]
      : [];
  });
}

export interface Cluster {
  name: string;
  keywords: string[];
}

/**
 * Word-based clusters used when no LLM is configured: each query joins the cluster of its most
 * common significant word across all queries (ties alphabetical), ignoring words that appear in
 * more than half of the queries.
 */
export function fallbackClusters(keywords: readonly string[]): Cluster[] {
  const unique = [...new Set(keywords)].sort();
  const freq = new Map<string, number>();
  for (const k of unique)
    for (const w of new Set(significantWords(k))) freq.set(w, (freq.get(w) ?? 0) + 1);
  // Words in more than half of all queries (e.g. "mug" for a mug shop) do not tell topics apart.
  const tooCommon = (w: string) => unique.length > 2 && (freq.get(w) ?? 0) > unique.length / 2;
  const groups = new Map<string, string[]>();
  for (const k of unique) {
    const all = [...new Set(significantWords(k))];
    const words = all.some((w) => !tooCommon(w)) ? all.filter((w) => !tooCommon(w)) : all;
    const head =
      words.sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0) || a.localeCompare(b))[0] ?? k;
    groups.set(head, [...(groups.get(head) ?? []), k]);
  }
  return [...groups]
    .map(([, members]) => ({
      name: [...members].sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? "",
      keywords: members,
    }))
    .sort((a, b) => b.keywords.length - a.keywords.length || a.name.localeCompare(b.name));
}

export interface MapEntry {
  url: string;
  keyword: string;
  role: "primary" | "secondary";
}

export const MAX_SECONDARY = 5;

/**
 * Automatic keyword-to-page map: each query goes to the page with the most clicks for it (then
 * impressions); per page the query with the most impressions is primary, up to 5 secondaries.
 */
export function autoMap(stats: readonly KeywordStat[]): MapEntry[] {
  const perPage = new Map<string, KeywordStat[]>();
  for (const s of stats) {
    const best = [...s.pages].sort(
      (a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.url.localeCompare(b.url),
    )[0];
    if (best) perPage.set(best.url, [...(perPage.get(best.url) ?? []), s]);
  }
  const out: MapEntry[] = [];
  for (const [url, list] of [...perPage].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...list].sort(
      (a, b) => b.impressions - a.impressions || a.keyword.localeCompare(b.keyword),
    );
    sorted
      .slice(0, 1 + MAX_SECONDARY)
      .forEach((s, i) =>
        out.push({ url, keyword: s.keyword, role: i === 0 ? "primary" : "secondary" }),
      );
  }
  return out;
}

/** A cluster is a content gap when no page is mapped to it and Google ranks the site beyond 20. */
export const GAP_MIN_POSITION = 20;

export interface ContentGap extends Cluster {
  impressions: number;
  bestPosition: number | null;
}

export function contentGaps(
  clusters: readonly Cluster[],
  stats: readonly KeywordStat[],
  map: readonly MapEntry[],
): ContentGap[] {
  const byKeyword = new Map(stats.map((s) => [s.keyword, s]));
  const mapped = new Set(map.map((m) => m.keyword));
  return clusters.flatMap((c) => {
    if (
      c.keywords.some(
        (k) => mapped.has(k) && (byKeyword.get(k)?.position ?? Infinity) <= GAP_MIN_POSITION,
      )
    ) {
      return [];
    }
    const positions = c.keywords
      .map((k) => byKeyword.get(k)?.position)
      .filter((p): p is number => p !== undefined);
    const best = positions.length ? Math.min(...positions) : null;
    if (best !== null && best <= GAP_MIN_POSITION) return [];
    return [
      {
        ...c,
        impressions: c.keywords.reduce((n, k) => n + (byKeyword.get(k)?.impressions ?? 0), 0),
        bestPosition: best,
      },
    ];
  });
}

export interface PageText {
  title: string | null;
  h1: string[];
  metaDescription: string | null;
}

export type KeywordField = "title" | "h1" | "description";

/** Words of `keyword` that `text` lacks (singular/plural tolerant). Empty = keyword appears. */
function missingWords(keyword: string, text: string | null): string[] {
  const have = new Set(significantWords(text ?? ""));
  return significantWords(keyword).filter((w) => !have.has(w));
}

/** KWD-001: fields of a page that do not contain its primary keyword. No density targets. */
export function primaryKeywordGaps(keyword: string, page: PageText): KeywordField[] {
  const fields: [KeywordField, string | null][] = [
    ["title", page.title],
    ["h1", page.h1.join(" ")],
    ["description", page.metaDescription],
  ];
  if (significantWords(keyword).length === 0) return [];
  return fields.filter(([, text]) => missingWords(keyword, text).length > 0).map(([f]) => f);
}
