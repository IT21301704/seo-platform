// Optional paid data (Phase 4): keyword volume/difficulty (M18) and backlinks (M16) from
// DataForSEO, or deterministic demo data in local development. The platform never estimates these
// numbers itself; without a provider the UI shows "—".
import { createHash } from "node:crypto";
import { ok } from "./http";
import type { JsonHttp } from "./http";

const API = "https://api.dataforseo.com/v3";

/** Google Ads location codes for the onboarding countries. */
export const LOCATION_CODES: Record<string, number> = {
  LK: 2144,
  IN: 2356,
  GB: 2826,
  US: 2840,
  AU: 2036,
  SG: 2702,
  AE: 2784,
  CA: 2124,
};

export interface KeywordMetric {
  /** Average monthly searches; null when the provider has no data. */
  volume: number | null;
  /** 0–100; null when unknown. */
  difficulty: number | null;
}

export interface KeywordDataApi {
  readonly provider: "dataforseo" | "demo";
  metrics(
    keywords: string[],
    country: string,
    language: string,
  ): Promise<Record<string, KeywordMetric>>;
}

export interface ReferringDomain {
  domain: string;
  links: number;
  /** ISO date the provider first saw a link. */
  firstSeen: string | null;
  /** Sample anchor texts. */
  anchors: string[];
}

export interface BacklinkSummary {
  referringDomains: number;
  backlinks: number;
  newReferringDomains30d: number | null;
}

/** A directory / citation listing with the business name, address and phone it shows. */
export interface Citation {
  source: string;
  url: string;
  name: string;
  address: string;
  phone: string;
}

export interface BacklinkApi {
  readonly provider: "dataforseo" | "demo";
  summary(domain: string): Promise<BacklinkSummary>;
  referringDomains(domain: string, limit: number): Promise<ReferringDomain[]>;
  citations(domain: string): Promise<Citation[]>;
}

interface DfsResponse<T> {
  status_code: number;
  status_message: string;
  tasks?: { status_code: number; status_message: string; result: T[] | null }[];
}

export class DataForSeoClient implements KeywordDataApi, BacklinkApi {
  readonly provider = "dataforseo" as const;

  constructor(
    private readonly http: JsonHttp,
    private readonly login: string,
    private readonly password: string,
  ) {}

  private async post<T>(path: string, body: unknown, what: string): Promise<T[]> {
    const res = ok(
      await this.http.send<DfsResponse<T>>({
        method: "POST",
        url: `${API}${path}`,
        headers: {
          authorization: `Basic ${Buffer.from(`${this.login}:${this.password}`).toString("base64")}`,
        },
        json: [body],
      }),
      `DataForSEO ${what}`,
    );
    const task = res.tasks?.[0];
    if (!task || task.status_code >= 40000) {
      throw new Error(`DataForSEO ${what}: ${task?.status_message ?? res.status_message}`);
    }
    return task.result ?? [];
  }

  async metrics(keywords: string[], country: string, language: string) {
    const location_code = LOCATION_CODES[country] ?? LOCATION_CODES["US"];
    const unique = [...new Set(keywords)].slice(0, 1000);
    const volumes = await this.post<{ keyword: string; search_volume: number | null }>(
      "/keywords_data/google_ads/search_volume/live",
      { keywords: unique, location_code, language_code: language },
      "search volume",
    );
    const difficulty = await this.post<{
      items?: { keyword: string; keyword_difficulty: number | null }[];
    }>(
      "/dataforseo_labs/google/bulk_keyword_difficulty/live",
      { keywords: unique, location_code, language_code: language },
      "keyword difficulty",
    );
    const kd = new Map((difficulty[0]?.items ?? []).map((i) => [i.keyword, i.keyword_difficulty]));
    const out: Record<string, KeywordMetric> = {};
    for (const k of unique) {
      out[k] = {
        volume: volumes.find((v) => v.keyword === k)?.search_volume ?? null,
        difficulty: kd.get(k) ?? null,
      };
    }
    return out;
  }

  async summary(domain: string): Promise<BacklinkSummary> {
    const [r] = await this.post<{
      referring_domains: number;
      backlinks: number;
      referring_domains_new?: number;
    }>(
      "/backlinks/summary/live",
      { target: domain, include_subdomains: true },
      "backlinks summary",
    );
    return {
      referringDomains: r?.referring_domains ?? 0,
      backlinks: r?.backlinks ?? 0,
      newReferringDomains30d: r?.referring_domains_new ?? null,
    };
  }

  async referringDomains(domain: string, limit: number): Promise<ReferringDomain[]> {
    const [r] = await this.post<{
      items?: { domain: string; backlinks: number; first_seen: string | null }[];
    }>(
      "/backlinks/referring_domains/live",
      { target: domain, limit, order_by: ["backlinks,desc"] },
      "referring domains",
    );
    return (r?.items ?? []).map((i) => ({
      domain: i.domain,
      links: i.backlinks,
      firstSeen: i.first_seen ? i.first_seen.slice(0, 10) : null,
      anchors: [],
    }));
  }

  /** DataForSEO has no directory-listing endpoint in this plan; citations stay empty. */
  async citations(): Promise<Citation[]> {
    return [];
  }
}

const h = (s: string): number => createHash("sha256").update(s).digest().readUInt32BE(0);

/** Deterministic sample keyword metrics, labelled "demo data" in the UI. */
export class DemoKeywordData implements KeywordDataApi {
  readonly provider = "demo" as const;

  async metrics(keywords: string[], country: string) {
    const out: Record<string, KeywordMetric> = {};
    for (const k of keywords) {
      const words = k.split(/\s+/).length;
      out[k] = {
        volume: Math.round(((h(`v${k}${country}`) % 4000) + 30) / words / 10) * 10,
        difficulty: h(`d${k}`) % 80,
      };
    }
    return out;
  }
}

/** Deterministic sample backlinks for a domain (including a few toxic-looking ones). */
export class DemoBacklinks implements BacklinkApi {
  readonly provider = "demo" as const;

  constructor(private readonly business: { name: string; address: string; phone: string }) {}

  async summary(domain: string): Promise<BacklinkSummary> {
    const domains = await this.referringDomains();
    return {
      referringDomains: 200 + (h(`rd${domain}`) % 40),
      backlinks: domains.reduce((n, d) => n + d.links, 0) * 15,
      newReferringDomains30d: 5 + (h(`new${domain}`) % 10),
    };
  }

  async referringDomains(): Promise<ReferringDomain[]> {
    return [
      {
        domain: "craftjournal.example",
        links: 46,
        firstSeen: "2026-03-02",
        anchors: ["handmade mugs"],
      },
      {
        domain: "spam-links.example",
        links: 31,
        firstSeen: "2026-09-03",
        anchors: ["cheap mugs cheap mugs", "casino"],
      },
      {
        domain: "localdirectory.example",
        links: 12,
        firstSeen: "2026-01-15",
        anchors: ["Example Store"],
      },
      {
        domain: "homeware-forum.example",
        links: 9,
        firstSeen: "2026-06-11",
        anchors: ["this shop"],
      },
      { domain: "giftguide.example", links: 6, firstSeen: "2026-08-20", anchors: ["gift mugs"] },
      {
        domain: "best-seo-links.xyz",
        links: 4,
        firstSeen: "2026-09-12",
        anchors: ["buy mugs online"],
      },
      {
        domain: "potterynews.example",
        links: 3,
        firstSeen: "2026-05-04",
        anchors: ["Example Store"],
      },
    ];
  }

  async citations(): Promise<Citation[]> {
    const { name, address, phone } = this.business;
    return [
      {
        source: "Local directory",
        url: "https://localdirectory.example/example-store",
        name,
        address,
        phone,
      },
      { source: "Maps listing", url: "https://maps.example/example-store", name, address, phone },
      {
        source: "Craft fair listing",
        url: "https://craftfair.example/makers/example-store",
        name,
        address: address.replace(/\bRoad\b/, "Rd"),
        phone,
      },
    ];
  }
}
