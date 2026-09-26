import type { RuleReport } from "@seo/scoring";
import type { Tone } from "@/components/ui";

/** Short labels for the 16 sitemap checks (screen 13); {n} = failing items. */
export const SMP_LABEL: Record<string, { ok: string; bad?: string }> = {
  "SMP-001": { ok: "Sitemap returns 200", bad: "Sitemap missing or broken" },
  "SMP-002": { ok: "Listed in robots.txt" },
  "SMP-003": { ok: "Submitted in Search Console" },
  "SMP-004": { ok: "Valid XML, UTF-8" },
  "SMP-005": { ok: "≤ 50,000 URLs and 50 MB per file" },
  "SMP-006": {
    ok: "Absolute https URLs, same host",
    bad: "{n} URLs not absolute https on this host",
  },
  "SMP-007": { ok: "Every URL returns 200", bad: "{n} redirected / broken URLs" },
  "SMP-008": { ok: "No noindex URLs", bad: "{n} noindex URLs listed" },
  "SMP-009": { ok: "No robots-blocked URLs", bad: "{n} robots-blocked URLs" },
  "SMP-010": { ok: "Only canonical URLs", bad: "{n} non-canonical URLs" },
  "SMP-011": { ok: "Valid lastmod dates", bad: "Valid lastmod dates ({n} invalid or in future)" },
  "SMP-012": { ok: "No indexable pages missing", bad: "{n} indexable pages missing" },
  "SMP-013": { ok: "No Search Console errors", bad: "Search Console errors on {n} sitemaps" },
  "SMP-014": { ok: "Listed URLs indexed", bad: "{n} listed URLs not indexed" },
  "SMP-015": { ok: "hreflang alternates" },
  "SMP-016": { ok: "Image / video sitemap entries" },
};

export function smpLabel(rule: RuleReport): string {
  const label = SMP_LABEL[rule.ruleId];
  if (!label) return rule.title;
  return rule.status === "fail" && label.bad
    ? label.bad.replace("{n}", String(rule.counts.fail))
    : label.ok;
}

export function smpStatus(rule: RuleReport, manualCount: number): { text: string; tone: Tone } {
  if (rule.status === "na") return { text: "Not applicable", tone: "gray" };
  if (rule.status === "pass") return { text: "Pass", tone: "pass" };
  if (rule.ruleId === "SMP-012") {
    const auto = Math.max(0, rule.counts.fail - manualCount);
    return {
      text: auto > 0 ? `${auto} auto · ${manualCount} manual` : `${manualCount} manual`,
      tone: "high",
    };
  }
  return rule.autoFixable
    ? {
        text: "Fail · auto-fix",
        tone: rule.severity === "medium" || rule.severity === "low" ? "med" : "high",
      }
    : { text: "Fail · review", tone: "med" };
}
