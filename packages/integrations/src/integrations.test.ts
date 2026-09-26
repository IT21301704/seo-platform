import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, encryptionKey } from "./crypto";
import { GoogleGa4Api, GoogleGscApi, queryCruxOrigin } from "./google/clients";
import { DemoGscApi } from "./google/demo";
import { authorizationUrl, exchangeCode, freshTokens } from "./google/oauth";
import { isIndexed } from "./google/types";
import type { JsonHttp, JsonRequest, JsonResponse } from "./http";
import { HttpError } from "./http";
import { RateLimiter, gscRange, planInspections, quotaDay } from "./quota";

/** Records requests and answers from a route table. */
class FakeHttp implements JsonHttp {
  readonly requests: JsonRequest[] = [];
  constructor(private readonly routes: (req: JsonRequest) => JsonResponse) {}
  async send<T>(req: JsonRequest): Promise<JsonResponse<T>> {
    this.requests.push(req);
    return this.routes(req) as JsonResponse<T>;
  }
}

const client = {
  clientId: "cid",
  clientSecret: "secret",
  redirectUri: "https://app.example/api/integrations/google/callback",
};

describe("token encryption (AES-256-GCM)", () => {
  const key = randomBytes(32);

  it("round-trips and never stores plaintext", () => {
    const enc = encryptSecret("refresh-token-123", key);
    expect(enc).not.toContain("refresh-token-123");
    expect(decryptSecret(enc, key)).toBe("refresh-token-123");
  });

  it("uses a fresh IV each time and rejects tampering", () => {
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key));
    const [v, iv, tag, data] = encryptSecret("secret", key).split(":");
    const flipped = Buffer.from(data ?? "", "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"), key)).toThrow();
  });

  it("requires a 32-byte ENCRYPTION_KEY", () => {
    expect(() => encryptionKey({ ENCRYPTION_KEY: "short" })).toThrow(/32 bytes/);
    expect(encryptionKey({ ENCRYPTION_KEY: "ab".repeat(32) })).toHaveLength(32);
  });
});

describe("Google OAuth", () => {
  it("builds a read-only, offline consent URL", () => {
    const url = new URL(authorizationUrl(client, "gsc", "state123"));
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/webmasters.readonly",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("state123");
  });

  it("exchanges a code and refreshes an expired token", async () => {
    const http = new FakeHttp((req) =>
      req.form?.["grant_type"] === "authorization_code"
        ? {
            status: 200,
            body: { access_token: "a1", refresh_token: "r1", expires_in: 3600, scope: "s" },
          }
        : { status: 200, body: { access_token: "a2", expires_in: 3600, scope: "s" } },
    );
    const tokens = await exchangeCode(http, client, "code", 1_000);
    expect(tokens).toEqual({
      refreshToken: "r1",
      accessToken: "a1",
      expiresAt: 3_601_000,
      scope: "s",
    });
    expect(await freshTokens(http, client, tokens, 2_000)).toBe(tokens); // still valid
    const refreshed = await freshTokens(http, client, tokens, 3_600_000);
    expect(refreshed.accessToken).toBe("a2");
    expect(refreshed.refreshToken).toBe("r1");
  });
});

describe("Search Console client", () => {
  const http = new FakeHttp((req) => {
    if (req.url.endsWith("/searchAnalytics/query")) {
      return {
        status: 200,
        body: {
          rows: [
            { keys: ["https://a.com/x/"], clicks: 5, impressions: 100, ctr: 0.05, position: 4.2 },
          ],
        },
      };
    }
    if (req.url.endsWith("/sitemaps")) {
      return {
        status: 200,
        body: {
          sitemap: [
            {
              path: "https://a.com/sitemap.xml",
              errors: "2",
              warnings: "1",
              contents: [{ submitted: "10", indexed: "7" }],
            },
          ],
        },
      };
    }
    if (req.url.includes("urlInspection")) {
      return {
        status: 200,
        body: {
          inspectionResult: {
            indexStatusResult: {
              verdict: "NEUTRAL",
              coverageState: "Crawled - currently not indexed",
            },
          },
        },
      };
    }
    return { status: 403, body: { error: { message: "forbidden" } } };
  });
  const gsc = new GoogleGscApi(http, async () => "token");

  it("parses search analytics, sitemaps and inspections with a bearer token", async () => {
    expect(
      await gsc.searchAnalytics("sc-domain:a.com", {
        startDate: "2026-08-26",
        endDate: "2026-09-22",
      }),
    ).toEqual([
      { page: "https://a.com/x/", clicks: 5, impressions: 100, ctr: 0.05, position: 4.2 },
    ]);
    expect((await gsc.listSitemaps("sc-domain:a.com"))[0]).toMatchObject({
      errors: 2,
      warnings: 1,
      submitted: 10,
      indexed: 7,
    });
    const inspection = await gsc.inspect("sc-domain:a.com", "https://a.com/x/");
    expect(isIndexed(inspection)).toBe(false);
    expect(http.requests[0]?.headers?.["authorization"]).toBe("Bearer token");
    expect(http.requests[0]?.url).toContain(encodeURIComponent("sc-domain:a.com"));
  });

  it("raises HttpError on API errors", async () => {
    await expect(gsc.listSites()).rejects.toBeInstanceOf(HttpError);
  });
});

describe("GA4 and CrUX", () => {
  it("reads sessions per page", async () => {
    const http = new FakeHttp(() => ({
      status: 200,
      body: {
        rows: [
          { dimensionValues: [{ value: "/a" }], metricValues: [{ value: "10" }] },
          { dimensionValues: [{ value: "/b" }], metricValues: [{ value: "30" }] },
        ],
      },
    }));
    expect(
      await new GoogleGa4Api(http, async () => "t").sessionsByPage("properties/1", {
        startDate: "a",
        endDate: "b",
      }),
    ).toEqual([
      { path: "/b", sessions: 30 },
      { path: "/a", sessions: 10 },
    ]);
  });

  it("bands CrUX p75 values and treats 404 as no data", async () => {
    const http = new FakeHttp(() => ({
      status: 200,
      body: {
        record: {
          metrics: {
            largest_contentful_paint: { percentiles: { p75: 3100 } },
            cumulative_layout_shift: { percentiles: { p75: "0.05" } },
          },
        },
      },
    }));
    expect(await queryCruxOrigin(http, "k", "https://a.com")).toEqual({
      lcp: { p75: 3100, band: "needs-improvement" },
      inp: null,
      cls: { p75: 0.05, band: "good" },
    });
    expect(
      await queryCruxOrigin(new FakeHttp(() => ({ status: 404, body: {} })), "k", "https://a.com"),
    ).toBeNull();
  });
});

describe("URL Inspection quota", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  const day = 86_400_000;

  it("uses the Pacific-time quota day", () => {
    expect(quotaDay(new Date("2026-09-25T05:00:00Z"))).toBe("2026-09-24");
    expect(quotaDay(new Date("2026-09-25T09:00:00Z"))).toBe("2026-09-25");
  });

  it("inspects never-seen URLs first, then stale ones, by traffic, within the remaining quota", () => {
    const plan = planInspections(
      [
        {
          url: "https://a.com/fresh",
          traffic: 999,
          lastInspectedAt: new Date(now.getTime() - day),
        },
        {
          url: "https://a.com/stale",
          traffic: 500,
          lastInspectedAt: new Date(now.getTime() - 10 * day),
        },
        { url: "https://a.com/new-low", traffic: 1, lastInspectedAt: null },
        { url: "https://a.com/new-high", traffic: 50, lastInspectedAt: null },
      ],
      3,
      now,
    );
    expect(plan).toEqual([
      "https://a.com/new-high",
      "https://a.com/new-low",
      "https://a.com/stale",
    ]);
  });

  it("never exceeds the remaining quota", () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({
      url: `https://a.com/${i}`,
      traffic: i,
      lastInspectedAt: null,
    }));
    expect(planInspections(many, 2000, now)).toHaveLength(2000);
    expect(planInspections(many, 0, now)).toEqual([]);
  });

  it("spaces calls to 600 per minute", async () => {
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      600,
      async (ms) => void sleeps.push(ms),
      () => 0,
    );
    for (let i = 0; i < 3; i++) await limiter.wait();
    expect(sleeps).toEqual([100, 200]);
  });

  it("uses a 28-day search analytics window ending 3 days ago", () => {
    expect(gscRange(now)).toEqual({ startDate: "2026-08-26", endDate: "2026-09-22" });
  });
});

describe("demo provider", () => {
  it("is deterministic", async () => {
    const make = () =>
      new DemoGscApi(
        "https://example-store.com",
        async () => ["https://example-store.com/a/", "https://example-store.com/b/"],
        async () => [],
        () => new Date(0),
      );
    expect(await make().searchAnalytics()).toEqual(await make().searchAnalytics());
    expect(await make().inspect("s", "https://example-store.com/blog/old-post/")).toMatchObject({
      verdict: "FAIL",
    });
  });
});
