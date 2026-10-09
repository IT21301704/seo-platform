import { fileURLToPath } from "node:url";
import { buildSiteFacts, crawlSite, loadFixtureSite } from "@seo/crawler";
import type { CrawlSnapshot, Fetcher } from "@seo/crawler";
import { RULES_BY_ID, evaluateRule } from "@seo/rules";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCandidates } from "./candidates";
import { FIXABLE_RULE_IDS, FIX_KINDS, kindForRule } from "./kinds";
import { recheckProposals } from "./recheck";
import type { CheckableFix } from "./recheck";
import { removeSitemapEntry } from "./simulate";
import { altFromFilename, replaceLink } from "./suggest";
import { verifyLive } from "./verify";

const FIXTURES = fileURLToPath(new URL("../../../fixtures/", import.meta.url));
const ORIGIN = "https://example-store.com";
const intent = { aiCrawlers: "allow" as const };

function fixture(name: string): { fetcher: Fetcher; crawl: () => Promise<CrawlSnapshot> } {
  const site = loadFixtureSite(
    name === "golden-site" ? `${FIXTURES}golden-site` : `${FIXTURES}broken-sites/${name}`,
  );
  return {
    fetcher: site.fetcher,
    crawl: () =>
      crawlSite({
        rootUrl: site.server.origin,
        fetcher: site.fetcher,
        pageLimit: 1000,
        crawledAt: site.server.crawledAt,
      }),
  };
}

const snapshots = new Map<string, CrawlSnapshot>();
beforeAll(async () => {
  for (const name of ["broken-onpage", "broken-indexing", "broken-links", "broken-sitemap"]) {
    snapshots.set(name, await fixture(name).crawl());
  }
});

function candidates(name: string, ruleId: string) {
  const snapshot = snapshots.get(name) as CrawlSnapshot;
  const site = buildSiteFacts(snapshot, { ownerIntent: intent });
  const rule = RULES_BY_ID.get(ruleId);
  if (!rule) throw new Error(ruleId);
  return buildCandidates(ruleId, evaluateRule(rule, site), site);
}

function check(name: string, fixes: CheckableFix[]) {
  return recheckProposals(snapshots.get(name) as CrawlSnapshot, intent, fixes);
}

describe("fix kinds", () => {
  it("covers only rules marked auto-fixable and keeps high-risk kinds approve-each", () => {
    for (const id of FIXABLE_RULE_IDS) expect(RULES_BY_ID.get(id)?.autoFixable).toBe(true);
    expect(kindForRule("ONP-004")?.risk).toBe("low");
    for (const kind of [
      "noindex",
      "canonical",
      "redirect",
      "robots_sitemap",
      "sitemap_exclude",
    ] as const) {
      expect(FIX_KINDS[kind].risk).toBe("high");
    }
    expect(kindForRule("SD-004")).toBeNull();
  });
});

describe("meta description (ONP-004)", () => {
  it("re-checks drafts with the rule engine: pass, too short, duplicate", () => {
    const [candidate] = candidates("broken-onpage", "ONP-004");
    expect(candidate).toMatchObject({
      url: `${ORIGIN}/about/`,
      needsDraft: true,
      currentValue: null,
    });
    const base = {
      kind: "meta_description" as const,
      url: `${ORIGIN}/about/`,
      ref: { url: `${ORIGIN}/about/` },
    };
    const results = check("broken-onpage", [
      {
        ...base,
        id: "good",
        value:
          "Meet the small team behind our handmade mugs and see where our island workshop is based.",
      },
    ]);
    expect(results.get("good")).toEqual({ result: "pass", detail: null });
    expect(
      check("broken-onpage", [{ ...base, id: "short", value: "About us" }]).get("short")?.result,
    ).toBe("Too short (min 70)");
    expect(
      check("broken-onpage", [{ ...base, id: "empty", value: "  " }]).get("empty")?.result,
    ).toBe("Empty");
  });

  it("catches two drafts that duplicate each other", () => {
    const text =
      "Handmade ceramic mugs from our island studio, glazed by hand and fired in small batches.";
    const results = check("broken-onpage", [
      { id: "a", kind: "meta_description", url: `${ORIGIN}/about/`, ref: {}, value: text },
      { id: "b", kind: "meta_description", url: `${ORIGIN}/faq/`, ref: {}, value: text },
    ]);
    expect(results.get("a")?.result).toMatch(/^Duplicate of \//);
  });
});

describe("titles (ONP-002)", () => {
  it("flags a draft equal to another page's title and passes a unique one", () => {
    const items = candidates("broken-onpage", "ONP-002");
    expect(items.map((c) => c.url)).toEqual([
      `${ORIGIN}/products/blue-ceramic-mug/`,
      `${ORIGIN}/products/speckled-stoneware-mug/`,
    ]);
    const speckled = items[1];
    const blueTitle = String(items[0]?.currentValue);
    const results = check("broken-onpage", [
      { id: "dup", kind: "title", url: speckled?.url ?? "", ref: {}, value: blueTitle },
    ]);
    expect(results.get("dup")?.result).toMatch(/^Duplicate of \/products\/blue-ceramic-mug\/$/);
    const ok = check("broken-onpage", [
      {
        id: "ok",
        kind: "title",
        url: speckled?.url ?? "",
        ref: {},
        value: "Speckled stoneware mug, 300 ml | Example Store",
      },
    ]);
    expect(ok.get("ok")?.result).toBe("pass");
  });
});

describe("image alt text (ONP-008)", () => {
  it("suggests alt text from the file name and re-checks it", () => {
    const [img] = candidates("broken-onpage", "ONP-008");
    expect(img?.suggestedValue).toEqual(expect.any(String));
    const results = check("broken-onpage", [
      {
        id: "i",
        kind: "image_alt",
        url: img?.url ?? "",
        ref: img?.ref ?? {},
        value: img?.suggestedValue ?? null,
      },
    ]);
    expect(results.get("i")?.result).toBe("pass");
  });

  it("derives readable alt text and refuses camera names", () => {
    expect(altFromFilename("https://x.test/wp-content/uploads/blue-ceramic-mug-300x200.jpg")).toBe(
      "Blue ceramic mug",
    );
    expect(altFromFilename("/images/speckled_stoneware_mug.svg")).toBe("Speckled stoneware mug");
    expect(altFromFilename("/uploads/IMG_4021.jpg")).toBeNull();
    expect(altFromFilename("/uploads/9f8e7d6c5b4a.png")).toBeNull();
  });
});

describe("indexing fixes", () => {
  it("removes noindex (IDX-003) and fixes canonicals (IDX-001, IDX-002)", () => {
    const fixes: CheckableFix[] = [];
    for (const ruleId of ["IDX-003", "IDX-001", "IDX-002"]) {
      for (const c of candidates("broken-indexing", ruleId)) {
        fixes.push({
          id: `${ruleId} ${c.url}`,
          kind: c.kind,
          url: c.url,
          ref: c.ref,
          value: c.suggestedValue,
        });
      }
    }
    expect(fixes.length).toBeGreaterThanOrEqual(3);
    for (const [id, result] of check("broken-indexing", fixes))
      expect([id, result.result]).toEqual([id, "pass"]);
  });
});

describe("links and redirects", () => {
  it("replaces a broken internal link (LNK-002) with a suggested page", () => {
    const items = candidates("broken-links", "LNK-002");
    expect(items.length).toBeGreaterThan(0);
    const fixes = items.map((c, i) => ({
      id: String(i),
      kind: c.kind,
      url: c.url,
      ref: c.ref,
      value: c.suggestedValue ?? `${ORIGIN}/blog/care-guide/`,
    }));
    for (const result of check("broken-links", fixes).values()) expect(result.result).toBe("pass");
    const bad = check("broken-links", [
      { ...(fixes[0] as CheckableFix), id: "x", value: "https://other.example/" },
    ]);
    expect(bad.get("x")?.result).toBe("Must be a page on this site");
  });

  it("collapses a redirect chain (TEC-004) into one hop", () => {
    const [c] = candidates("broken-links", "TEC-004");
    expect(c?.suggestedValue).toMatchObject({ status: 301 });
    const results = check("broken-links", [
      {
        id: "r",
        kind: "redirect",
        url: c?.url ?? "",
        ref: c?.ref ?? {},
        value: c?.suggestedValue ?? null,
      },
    ]);
    expect(results.get("r")?.result).toBe("pass");
  });

  it("rewrites matching hrefs only, keeping relative links relative", () => {
    const html =
      '<a href="/blog/old-post/">a</a> <a href="https://example-store.com/blog/old-post/">b</a> <a href="/blog/">c</a>';
    const out = replaceLink(
      html,
      `${ORIGIN}/`,
      `${ORIGIN}/blog/old-post/`,
      `${ORIGIN}/blog/care-guide/`,
    );
    expect(out.count).toBe(2);
    expect(out.content).toBe(
      '<a href="/blog/care-guide/">a</a> <a href="https://example-store.com/blog/care-guide/">b</a> <a href="/blog/">c</a>',
    );
  });
});

describe("sitemap fixes (M17 auto-fix)", () => {
  it("adds the Sitemap line (SMP-002) and removes bad URLs (SMP-007, SMP-008)", () => {
    const fixes: CheckableFix[] = [];
    for (const ruleId of ["SMP-002", "SMP-007", "SMP-008"]) {
      for (const c of candidates("broken-sitemap", ruleId)) {
        fixes.push({
          id: `${ruleId} ${c.url}`,
          kind: c.kind,
          url: c.url,
          ref: c.ref,
          value: c.suggestedValue,
        });
      }
    }
    expect(fixes.map((f) => f.id.split(" ")[0])).toEqual(
      expect.arrayContaining(["SMP-002", "SMP-007", "SMP-008"]),
    );
    for (const [id, result] of check("broken-sitemap", fixes))
      expect([id, result.result]).toEqual([id, "pass"]);
  });

  it("removes only the matching <url> entry", () => {
    const xml = `<urlset><url><loc>${ORIGIN}/a/</loc></url><url><loc>${ORIGIN}/b/</loc><lastmod>2026-01-01</lastmod></url></urlset>`;
    expect(removeSitemapEntry(xml, `${ORIGIN}/b/`)).toBe(
      `<urlset><url><loc>${ORIGIN}/a/</loc></url></urlset>`,
    );
  });
});

describe("live verification", () => {
  it("verifies a published value against the live page and the rule", async () => {
    const golden = fixture("golden-site");
    const goldenSnapshot = await golden.crawl();
    const live = goldenSnapshot.pages.find((p) => p.url === `${ORIGIN}/about/`);
    const description = /name="description" content="([^"]+)"/.exec(live?.rawHtml ?? "")?.[1] ?? "";
    const fix: CheckableFix = {
      id: "f",
      kind: "meta_description",
      url: `${ORIGIN}/about/`,
      ref: {},
      value: description,
    };
    const snapshot = snapshots.get("broken-onpage") as CrawlSnapshot;

    // The "live" site has the description: verified.
    const ok = await verifyLive(snapshot, intent, [fix], golden.fetcher);
    expect(ok.get("f")).toEqual({ verified: true, observed: description, reason: null });

    // The live site still lacks it (e.g. not published or cached): not verified, with a reason.
    const stale = await verifyLive(snapshot, intent, [fix], fixture("broken-onpage").fetcher);
    expect(stale.get("f")).toMatchObject({ verified: false, observed: null, reason: "Empty" });
  });
});
