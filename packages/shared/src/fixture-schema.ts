import { z } from "zod";
import { RULE_ID_PATTERN } from "./constants";

/** One expected failure: a rule failing on a URL (or site-wide when url is null). */
export const ExpectedFailureSchema = z.object({
  ruleId: z.string().regex(RULE_ID_PATTERN),
  url: z.url().nullable(),
  note: z.string().min(1),
});

/**
 * Expected result for a fixture site (fixtures/expected/<fixture>.json).
 * Phase 0 lists the planted faults; Phase 1 fills in expectedScore.
 */
export const FixtureExpectationSchema = z.object({
  fixture: z.string().regex(/^(golden-site|broken-[a-z]+)$/),
  rulesetVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().min(1),
  /** Files that differ from the golden site (empty for golden). */
  changedFiles: z.array(z.string().min(1)),
  expectedFailures: z.array(ExpectedFailureSchema),
  /** Every applicable rule not listed above must pass. */
  allOtherApplicableRules: z.literal("pass"),
  /** Health score; null until the scoring engine exists (Phase 1). */
  expectedScore: z.number().int().min(0).max(100).nullable(),
});

export type FixtureExpectation = z.infer<typeof FixtureExpectationSchema>;

/** Server behaviour a static folder cannot express (fixtures/<site>/_fixture.json). */
export const FixtureServerSchema = z.object({
  origin: z.url(),
  /** Fixed "now" for the fixture; rules compare dates against this, never Date.now(). */
  crawledAt: z.iso.datetime(),
  /** Other scheme/host variants that 301 to origin (HTTP→HTTPS, www→apex). */
  alternateOrigins: z.array(z.url()),
  /** Paths that return a status other than their natural one (200, or 404 if missing). */
  statusOverrides: z.record(z.string().startsWith("/"), z.number().int().min(100).max(599)),
  redirects: z.array(
    z.object({
      from: z.string().startsWith("/"),
      to: z.string().startsWith("/"),
      status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
    }),
  ),
  /** File served for any unknown path. */
  notFoundFile: z.string(),
  /** Status for unknown paths: 404 on a healthy site, 200 on a soft-404 site. */
  notFoundStatus: z.number().int().min(100).max(599),
  /** Recorded transfer compression (the fixture fetcher serves plain bytes). */
  compression: z.enum(["br", "gzip", "none"]),
  headers: z.record(z.string(), z.string()),
  /** Recorded Core Web Vitals bands (lab data is non-deterministic, so fixtures pin it). */
  performance: z.object({
    lcp: z.enum(["good", "needs-improvement", "poor"]),
    inp: z.enum(["good", "needs-improvement", "poor"]),
    cls: z.enum(["good", "needs-improvement", "poor"]),
  }),
  /** What the site owner wants; AI-002 compares robots.txt against this. */
  ownerIntent: z.object({
    aiCrawlers: z.enum(["allow", "block"]),
  }),
});

export type FixtureServer = z.infer<typeof FixtureServerSchema>;
