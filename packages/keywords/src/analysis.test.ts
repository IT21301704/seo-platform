import { describe, expect, it } from "vitest";
import {
  aggregate,
  autoMap,
  brandWordsFor,
  cannibalization,
  classifyIntent,
  contentGaps,
  fallbackClusters,
  ideasFor,
  primaryKeywordGaps,
  quickWins,
} from "./analysis";
import type { QueryRow } from "./analysis";

const O = "https://example-store.com";
const row = (
  query: string,
  page: string,
  country: string,
  impressions: number,
  position: number,
  clicks = 0,
): QueryRow => ({
  query,
  page: `${O}${page}`,
  country,
  clicks,
  impressions,
  position,
});

const rows: QueryRow[] = [
  row("ceramic mugs", "/collections/mugs/", "lka", 900, 14, 9),
  row("ceramic mugs", "/collections/mugs/", "gbr", 100, 16, 1),
  row("ceramic mugs", "/", "lka", 300, 9, 6),
  row("gift mugs", "/collections/mugs/", "lka", 400, 11, 4),
  row("gift mugs", "/products/gift-set/", "lka", 380, 12, 5),
  row("gift mugs", "/blog/", "lka", 5, 40),
  row("how to clean ceramic mugs", "/blog/care-guide/", "lka", 200, 6, 12),
  row("buy coffee mugs online", "/collections/mugs/", "lka", 150, 9, 3),
  row("personalised mugs", "/services/", "lka", 120, 34),
  row("personalised name mugs", "/services/", "lka", 60, 38),
  row("example store", "/", "lka", 80, 1, 40),
];

describe("aggregate", () => {
  it("sums per keyword with impression-weighted positions and filters by country", () => {
    const all = aggregate(rows);
    const ceramic = all.find((s) => s.keyword === "ceramic mugs");
    expect(ceramic).toMatchObject({ impressions: 1300, clicks: 16 });
    // (900*14 + 100*16 + 300*9) / 1300 = 13
    expect(ceramic?.position).toBe(13);
    expect(ceramic?.pages.map((p) => p.url)).toEqual([`${O}/collections/mugs/`, `${O}/`]);
    expect(aggregate(rows, { country: "gbr" }).map((s) => s.keyword)).toEqual(["ceramic mugs"]);
  });

  it("is deterministic regardless of row order", () => {
    expect(aggregate([...rows].reverse())).toEqual(aggregate(rows));
  });
});

describe("intent and ideas", () => {
  it("classifies intent with fixed word lists", () => {
    const brand = brandWordsFor(`${O}/`);
    expect(brand).toEqual(["example-store", "example store"]);
    expect(classifyIntent("example store contact", brand)).toBe("navigational");
    expect(classifyIntent("buy coffee mugs online")).toBe("transactional");
    expect(classifyIntent("how to clean ceramic mugs")).toBe("informational");
    expect(classifyIntent("gift mugs")).toBe("commercial");
  });

  it("finds ideas that share a word with the seed (plural tolerant)", () => {
    const stats = aggregate(rows);
    expect(
      ideasFor(stats, "ceramic mug")
        .map((s) => s.keyword)
        .sort(),
    ).toEqual([
      "buy coffee mugs online",
      "ceramic mugs",
      "gift mugs",
      "how to clean ceramic mugs",
      "personalised mugs",
      "personalised name mugs",
    ]);
    expect(ideasFor(stats, "")).toHaveLength(stats.length);
  });
});

describe("quick wins and cannibalization", () => {
  it("lists positions 5–20 with enough impressions", () => {
    expect(quickWins(aggregate(rows)).map((s) => s.keyword)).toEqual([
      "ceramic mugs",
      "gift mugs",
      "how to clean ceramic mugs",
      "buy coffee mugs online",
    ]);
  });

  it("flags queries where two pages each get a real share (KWD-002)", () => {
    const found = cannibalization(aggregate(rows));
    expect(found.map((c) => c.keyword)).toEqual(["ceramic mugs", "gift mugs"]);
    // The blog page's 5 impressions are noise, not competition.
    expect(found[1]?.pages.map((p) => p.url)).toEqual([
      `${O}/collections/mugs/`,
      `${O}/products/gift-set/`,
    ]);
  });
});

describe("map, clusters and content gaps", () => {
  it("maps each query to its best page with one primary per page", () => {
    const map = autoMap(aggregate(rows));
    expect(map.filter((m) => m.role === "primary").map((m) => [m.url, m.keyword])).toEqual([
      [`${O}/`, "example store"],
      [`${O}/blog/care-guide/`, "how to clean ceramic mugs"],
      [`${O}/collections/mugs/`, "ceramic mugs"],
      [`${O}/products/gift-set/`, "gift mugs"],
      [`${O}/services/`, "personalised mugs"],
    ]);
  });

  it("groups queries by their most common word without an LLM, ignoring site-wide words", () => {
    // "mug" is in 6 of 7 queries, so it does not decide the topic.
    expect(fallbackClusters(rows.map((r) => r.query))).toEqual([
      { name: "ceramic mugs", keywords: ["ceramic mugs", "how to clean ceramic mugs"] },
      { name: "personalised mugs", keywords: ["personalised mugs", "personalised name mugs"] },
      { name: "buy coffee mugs online", keywords: ["buy coffee mugs online"] },
      { name: "example store", keywords: ["example store"] },
      { name: "gift mugs", keywords: ["gift mugs"] },
    ]);
  });

  it("reports clusters the site ranks beyond position 20 for as gaps", () => {
    const stats = aggregate(rows);
    const clusters = [
      { name: "personalised mugs", keywords: ["personalised mugs", "personalised name mugs"] },
      { name: "ceramic mugs", keywords: ["ceramic mugs", "gift mugs"] },
    ];
    expect(contentGaps(clusters, stats, autoMap(stats))).toEqual([
      { ...clusters[0], impressions: 180, bestPosition: 34 },
    ]);
  });

  it("checks the primary keyword in title, H1 and description (KWD-001)", () => {
    const page = {
      title: "Ceramic mugs, handmade | Example Store",
      h1: ["Our mugs"],
      metaDescription: "Handmade ceramic mugs from our island studio.",
    };
    expect(primaryKeywordGaps("ceramic mugs", page)).toEqual(["h1"]);
    expect(primaryKeywordGaps("ceramic mug", page)).toEqual(["h1"]);
  });
});
