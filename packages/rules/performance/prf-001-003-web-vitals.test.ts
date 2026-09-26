import { describe, expect, it } from "vitest";
import { ORIGIN, check, summary } from "../src/testing";
import { PRF_001 } from "./prf-001-lcp";
import { PRF_002 } from "./prf-002-inp";
import { PRF_003 } from "./prf-003-cls";

const perf = (
  lcp: "good" | "poor",
  inp: "good" | "needs-improvement" | null,
  cls: "good" | "poor",
) => ({
  performance: {
    source: "psi" as const,
    pages: [{ url: `${ORIGIN}/`, lcp, inp, cls, basis: "field" as const }],
    note: null,
  },
});

describe("PRF-001..003 Core Web Vitals bands", () => {
  it("pass when every metric is good", async () => {
    for (const rule of [PRF_001, PRF_002, PRF_003]) {
      expect(summary(await check(rule, perf("good", "good", "good")))).toEqual(["pass /"]);
    }
  });

  it("fail for needs-improvement or poor", async () => {
    const options = perf("poor", "needs-improvement", "poor");
    for (const rule of [PRF_001, PRF_002, PRF_003]) {
      expect(summary(await check(rule, options))).toEqual(["fail /"]);
    }
  });

  it("are not applicable without measurements (INP has no lab value)", async () => {
    expect(summary(await check(PRF_002, perf("good", null, "good")))).toEqual(["na site"]);
    const none = { performance: { source: "none" as const, pages: [], note: null } };
    expect(summary(await check(PRF_001, none))).toEqual(["na site"]);
  });
});
