import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AuditReport } from "@seo/scoring";
import { describe, expect, it } from "vitest";
import { diffAudits, triggeredAlerts } from "./monitoring";

const report = (name: string): AuditReport =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../../fixtures/expected/reports/${name}.report.json`, import.meta.url),
      ),
      "utf8",
    ),
  ) as AuditReport;

const golden = report("golden-site");
const indexing = report("broken-indexing");
const links = report("broken-links");

describe("diffAudits", () => {
  it("records a baseline for the first audit", () => {
    expect(diffAudits(null, golden).map((e) => e.type)).toEqual(["baseline"]);
  });

  it("reports a score drop and pages that became noindex", () => {
    const events = diffAudits(golden, indexing);
    expect(events.find((e) => e.type === "score_drop")?.message).toBe(
      "Score dropped 1 point (100 → 99)",
    );
    expect(events.find((e) => e.type === "became_noindex")).toMatchObject({
      level: "critical",
      message: "1 page became noindex",
      data: { urls: ["https://example-store.com/about/"] },
    });
  });

  it("reports new broken links and new pages", () => {
    const events = diffAudits(golden, links);
    expect(events.find((e) => e.type === "new_broken_links")?.message).toBe(
      "1 new broken link detected",
    );
    expect(events.find((e) => e.type === "pages_added")?.data["urls"]).toContain(
      "https://example-store.com/blog/old-post/",
    );
  });

  it("says healthy when nothing got worse", () => {
    const events = diffAudits(indexing, golden);
    expect(events.map((e) => e.type)).toEqual(["score_rise", "pages_removed", "healthy"]);
    expect(events.at(-1)?.message).toBe("14 pages healthy, no new issues");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(diffAudits(golden, links))).toBe(
      JSON.stringify(diffAudits(golden, links)),
    );
  });
});

describe("triggeredAlerts", () => {
  const rules = [
    { type: "score_drop" as const, enabled: true, threshold: 0 },
    { type: "new_critical" as const, enabled: true, threshold: null },
    { type: "noindex" as const, enabled: true, threshold: null },
  ];

  it("fires score-drop, critical and noindex alerts", () => {
    expect(triggeredAlerts(diffAudits(golden, indexing), rules).map((a) => a.type)).toEqual([
      "score_drop",
      "new_critical",
      "noindex",
    ]);
  });

  it("respects thresholds and disabled rules", () => {
    const events = diffAudits(golden, indexing);
    expect(triggeredAlerts(events, [{ type: "score_drop", enabled: true, threshold: 5 }])).toEqual(
      [],
    );
    expect(triggeredAlerts(events, [{ type: "noindex", enabled: false, threshold: null }])).toEqual(
      [],
    );
  });
});
