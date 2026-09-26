import type { FixtureServer } from "@seo/shared";
import type { Band, CrawlSnapshot, Fetcher, PerformanceData, PerformancePage } from "./types";

/** Supplies Core Web Vitals bands for the sample pages. Never raw milliseconds in rules. */
export interface PerformanceSource {
  measure(urls: string[]): Promise<PerformanceData>;
}

/** Fixture sites: bands recorded in _fixture.json (lab runs are not deterministic). */
export class RecordedPerformance implements PerformanceSource {
  constructor(private readonly bands: FixtureServer["performance"]) {}

  async measure(urls: string[]): Promise<PerformanceData> {
    const home = urls[0];
    return {
      source: "fixture",
      pages: home ? [{ url: home, ...this.bands, basis: "recorded" }] : [],
      note: "Recorded bands from the fixture",
    };
  }
}

export const NO_PERFORMANCE: PerformanceSource = {
  async measure(): Promise<PerformanceData> {
    return {
      source: "none",
      pages: [],
      note: "Performance not measured: set PSI_API_KEY to enable PageSpeed Insights / CrUX",
    };
  },
};

const LAB_RUNS = 5;
const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/** Core Web Vitals thresholds (web.dev). Upper bounds for "good" and "needs improvement". */
const THRESHOLDS = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] } as const;

export function band(metric: keyof typeof THRESHOLDS, value: number): Band {
  const [good, ni] = THRESHOLDS[metric];
  if (value <= good) return "good";
  if (value <= ni) return "needs-improvement";
  return "poor";
}

interface PsiMetric {
  percentile?: number;
}
interface PsiResponse {
  loadingExperience?: { metrics?: Record<string, PsiMetric> };
  lighthouseResult?: { audits?: Record<string, { numericValue?: number }> };
}

/**
 * PageSpeed Insights (mobile). Prefers CrUX field data for the URL; otherwise uses the median
 * of 5 Lighthouse lab runs. INP has no lab equivalent, so it is null without field data.
 */
export class PsiPerformance implements PerformanceSource {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetcher,
  ) {}

  async measure(urls: string[]): Promise<PerformanceData> {
    const pages: PerformancePage[] = [];
    for (const url of urls) {
      const page = await this.measurePage(url);
      if (page) pages.push(page);
    }
    return {
      source: "psi",
      pages,
      note: pages.length === 0 ? "PageSpeed Insights returned no data" : null,
    };
  }

  private async measurePage(url: string): Promise<PerformancePage | null> {
    const first = await this.run(url);
    if (!first) return null;
    const field = first.loadingExperience?.metrics;
    const lcpField = field?.["LARGEST_CONTENTFUL_PAINT_MS"]?.percentile;
    const clsField = field?.["CUMULATIVE_LAYOUT_SHIFT_SCORE"]?.percentile;
    const inpField = field?.["INTERACTION_TO_NEXT_PAINT"]?.percentile;
    if (lcpField !== undefined && clsField !== undefined) {
      return {
        url,
        lcp: band("lcp", lcpField),
        cls: band("cls", clsField / 100),
        inp: inpField === undefined ? null : band("inp", inpField),
        basis: "field",
      };
    }
    const runs = [first];
    for (let i = 1; i < LAB_RUNS; i++) {
      const run = await this.run(url);
      if (run) runs.push(run);
    }
    const lab = (audit: string) =>
      median(
        runs
          .map((r) => r.lighthouseResult?.audits?.[audit]?.numericValue)
          .filter((v): v is number => v !== undefined),
      );
    const lcp = lab("largest-contentful-paint");
    const cls = lab("cumulative-layout-shift");
    return {
      url,
      lcp: lcp === null ? null : band("lcp", lcp),
      cls: cls === null ? null : band("cls", cls),
      inp: null,
      basis: "lab",
    };
  }

  private async run(url: string): Promise<PsiResponse | null> {
    const query = new URLSearchParams({
      url,
      strategy: "mobile",
      key: this.apiKey,
      category: "performance",
    });
    try {
      const res = await this.fetcher.fetch({ url: `${PSI_ENDPOINT}?${query.toString()}` });
      if (res.status !== 200) return null;
      return JSON.parse(res.body.toString("utf8")) as PsiResponse;
    } catch {
      return null;
    }
  }
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Fixed performance sample: the home page plus the shallowest indexable pages (URL order breaks
 * ties). Traffic-based sampling needs GA4 (Phase 2).
 */
export function performanceSample(snapshot: CrawlSnapshot, size: number): string[] {
  const candidates = snapshot.pages
    .filter((p) => p.status === 200 && p.chain.length === 0 && p.rawHtml !== null)
    .map((p) => p.url);
  const rest = candidates
    .filter((u) => u !== snapshot.rootUrl)
    .sort((a, b) => {
      const depth = (u: string) => new URL(u).pathname.split("/").filter(Boolean).length;
      return depth(a) - depth(b) || a.localeCompare(b);
    });
  return [snapshot.rootUrl, ...rest].slice(0, Math.max(1, size));
}
