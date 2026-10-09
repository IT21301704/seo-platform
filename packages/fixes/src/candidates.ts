// Turns the failing outcomes of one rule into fix candidates (one per page, image or link).
import type { SiteFacts } from "@seo/crawler";
import type { WpRef, WpValue } from "@seo/integrations";
import type { RuleOutcome } from "@seo/rules";
import { kindForRule } from "./kinds";
import type { FixKind } from "./kinds";
import { altFromFilename, bestReplacement } from "./suggest";

export interface FixCandidate {
  ruleId: string;
  kind: FixKind;
  /** Page the change is about (the robots.txt URL for site-level fixes). */
  url: string;
  ref: WpRef;
  /** What the audit saw, for display. */
  currentValue: WpValue;
  /** Deterministic suggestion, or null when the LLM or the owner must provide the value. */
  suggestedValue: WpValue;
  needsDraft: boolean;
  /** Short context shown in the review table (e.g. why a URL leaves the sitemap). */
  note: string | null;
}

const MAX_CANDIDATES = 200;

function sitemapNote(ruleId: string, evidence: RuleOutcome["evidence"]): string {
  switch (ruleId) {
    case "SMP-007":
      return evidence["problem"] === "redirects"
        ? `Redirects to ${String(evidence["to"])}`
        : `Returns ${String(evidence["status"] ?? "an error")}`;
    case "SMP-008":
      return "Page is set to noindex";
    case "SMP-009":
      return "Blocked for Googlebot by robots.txt";
    case "SMP-010":
      return `Canonical points to ${String(evidence["canonical"])}`;
    default:
      return "";
  }
}

/** Candidates for the failing outcomes of `ruleId` (capped at 200 per batch). */
export function buildCandidates(
  ruleId: string,
  outcomes: readonly RuleOutcome[],
  site: SiteFacts,
): FixCandidate[] {
  const def = kindForRule(ruleId);
  if (!def) return [];
  const failing = outcomes.filter((o) => o.result === "fail");
  const out: FixCandidate[] = [];
  const base = (url: string) => ({ ruleId, kind: def.kind, url, note: null });

  for (const outcome of failing) {
    const url = outcome.url;
    const facts = url ? site.pageByUrl.get(url)?.facts : null;
    switch (def.kind) {
      case "meta_description":
        if (url)
          out.push({
            ...base(url),
            ref: { url },
            currentValue: facts?.metaDescription ?? null,
            suggestedValue: null,
            needsDraft: true,
          });
        break;
      case "title":
        if (url)
          out.push({
            ...base(url),
            ref: { url },
            currentValue: facts?.title ?? null,
            suggestedValue: null,
            needsDraft: true,
          });
        break;
      case "image_alt":
        for (const img of (facts?.images ?? []).filter((i) => i.alt === null)) {
          if (!url) break;
          const src = img.url ?? img.src;
          const suggestion = altFromFilename(src);
          out.push({
            ...base(url),
            ref: { url, src },
            currentValue: null,
            suggestedValue: suggestion,
            needsDraft: false,
            note: suggestion ? "From the file name: check it matches the picture" : null,
          });
        }
        break;
      case "link": {
        const broken = (outcome.evidence["brokenLinks"] as { url: string; status: number }[]) ?? [];
        for (const link of broken) {
          if (!url) break;
          out.push({
            ...base(url),
            ref: { url, from: link.url },
            currentValue: link.url,
            suggestedValue: bestReplacement(link.url, site),
            needsDraft: false,
            note: `Returns ${link.status}`,
          });
        }
        break;
      }
      case "noindex":
        if (url)
          out.push({
            ...base(url),
            ref: { url },
            currentValue: true,
            suggestedValue: false,
            needsDraft: false,
          });
        break;
      case "canonical":
        if (url)
          out.push({
            ...base(url),
            ref: { url },
            currentValue: facts?.canonical ?? null,
            suggestedValue: url,
            needsDraft: false,
          });
        break;
      case "redirect": {
        const record = url ? site.pageByUrl.get(url)?.record : null;
        if (!url || !record) break;
        const chain = [...record.chain.map((h) => h.url), record.finalUrl];
        const from = new URL(url);
        out.push({
          ...base(url),
          ref: { from: `${from.pathname}${from.search}` },
          currentValue: chain.join(" → "),
          suggestedValue: { to: record.finalUrl, status: 301 },
          needsDraft: false,
        });
        break;
      }
      case "robots_sitemap": {
        const sitemap = site.sitemaps.find((s) => s.record.status === 200)?.record.url ?? null;
        out.push({
          ...base(`${site.origin}/robots.txt`),
          ref: {},
          currentValue: null,
          suggestedValue: sitemap ? [`Sitemap: ${sitemap}`] : null,
          needsDraft: false,
          note: sitemap ? null : "No sitemap was found to list. Create one first (SMP-001).",
        });
        break;
      }
      case "sitemap_exclude":
        if (url)
          out.push({
            ...base(url),
            ref: { url },
            currentValue: false,
            suggestedValue: true,
            needsDraft: false,
            note: sitemapNote(ruleId, outcome.evidence),
          });
        break;
      case "sitemap_include":
        if (url)
          out.push({
            ...base(url),
            ref: { url },
            currentValue: true,
            suggestedValue: false,
            needsDraft: false,
            note: "Indexable page that no sitemap lists",
          });
        break;
    }
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out.slice(0, MAX_CANDIDATES);
}
