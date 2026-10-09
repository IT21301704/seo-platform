// Fix kinds (REQUIREMENTS M12): what each auto-fixable rule changes, how risky it is, which
// plugin field holds the value and which rules must pass afterwards.
import type { SeoPlugin, WpField } from "@seo/integrations";

export type FixKind =
  | "meta_description"
  | "title"
  | "image_alt"
  | "link"
  | "noindex"
  | "canonical"
  | "redirect"
  | "robots_sitemap"
  | "sitemap_exclude"
  | "sitemap_include";

export type FixRisk = "low" | "high";

export interface FixKindDef {
  kind: FixKind;
  /** Rules this kind fixes. */
  ruleIds: readonly string[];
  /** Rules re-run on the preview (simulated) and after publishing (live). */
  recheckRules: readonly string[];
  /** Low risk: bulk approval allowed after preview. High risk: approve each item. */
  risk: FixRisk;
  /** Values drafted by the LLM ("ai") or computed from the crawl ("rule"). */
  drafted: "ai" | "rule";
  /** Plugin field written on publish. */
  wpField: WpField;
  /** Value type of newValue in the UI. */
  input: "text" | "url" | "fixed";
  label: string;
  /** Change log heading, e.g. "Meta descriptions added". */
  changeTitle: string;
  /** Which setting the plugin changes, per SEO plugin (shown as "Publishing to ..."). */
  field(seo: SeoPlugin): string;
}

const SEO_NAME: Record<SeoPlugin, string> = {
  yoast: "Yoast SEO",
  rankmath: "Rank Math",
  core: "SEO Platform plugin",
};

export const FIX_KINDS: Record<FixKind, FixKindDef> = {
  meta_description: {
    kind: "meta_description",
    ruleIds: ["ONP-004"],
    recheckRules: ["ONP-004"],
    risk: "low",
    drafted: "ai",
    wpField: "description",
    input: "text",
    label: "Meta description",
    changeTitle: "Meta descriptions added",
    field: (seo) => `${SEO_NAME[seo]} description field`,
  },
  title: {
    kind: "title",
    ruleIds: ["ONP-001", "ONP-002", "ONP-003"],
    recheckRules: ["ONP-001", "ONP-002", "ONP-003"],
    risk: "low",
    drafted: "ai",
    wpField: "title",
    input: "text",
    label: "Page title",
    changeTitle: "Page titles rewritten",
    field: (seo) => `${SEO_NAME[seo]} SEO title field`,
  },
  image_alt: {
    kind: "image_alt",
    ruleIds: ["ONP-008"],
    recheckRules: ["ONP-008"],
    risk: "low",
    drafted: "rule",
    wpField: "image_alt",
    input: "text",
    label: "Image alt text",
    changeTitle: "Alt text added",
    field: () => "Media library alt text",
  },
  link: {
    kind: "link",
    ruleIds: ["LNK-002"],
    recheckRules: ["LNK-002"],
    risk: "low",
    drafted: "rule",
    wpField: "post_content",
    input: "url",
    label: "Broken internal link",
    changeTitle: "Broken internal links replaced",
    field: () => "Page content (link target)",
  },
  noindex: {
    kind: "noindex",
    ruleIds: ["IDX-003"],
    recheckRules: ["IDX-003"],
    risk: "high",
    drafted: "rule",
    wpField: "noindex",
    input: "fixed",
    label: "Allow indexing",
    changeTitle: "noindex removed",
    field: (seo) => `${SEO_NAME[seo]} robots setting`,
  },
  canonical: {
    kind: "canonical",
    ruleIds: ["IDX-001", "IDX-002"],
    recheckRules: ["IDX-001", "IDX-002"],
    risk: "high",
    drafted: "rule",
    wpField: "canonical",
    input: "url",
    label: "Canonical URL",
    changeTitle: "Canonical tag changed",
    field: (seo) => `${SEO_NAME[seo]} canonical URL`,
  },
  redirect: {
    kind: "redirect",
    ruleIds: ["TEC-004"],
    recheckRules: ["TEC-004"],
    risk: "high",
    drafted: "rule",
    wpField: "redirect",
    input: "url",
    label: "Redirect target",
    changeTitle: "Redirect added",
    field: () => "SEO Platform plugin redirects",
  },
  robots_sitemap: {
    kind: "robots_sitemap",
    ruleIds: ["SMP-002"],
    recheckRules: ["SMP-002"],
    risk: "high",
    drafted: "rule",
    wpField: "robots_lines",
    input: "fixed",
    label: "robots.txt Sitemap line",
    changeTitle: "Sitemap added to robots.txt",
    field: () => "WordPress virtual robots.txt",
  },
  sitemap_exclude: {
    kind: "sitemap_exclude",
    ruleIds: ["SMP-007", "SMP-008", "SMP-009", "SMP-010"],
    recheckRules: ["SMP-007", "SMP-008", "SMP-009", "SMP-010"],
    risk: "high",
    drafted: "rule",
    wpField: "sitemap_exclude",
    input: "fixed",
    label: "Remove from sitemap",
    changeTitle: "URLs removed from the sitemap",
    field: (seo) =>
      seo === "core" ? "WordPress sitemap exclusions" : `${SEO_NAME[seo]} sitemap exclusions`,
  },
  sitemap_include: {
    kind: "sitemap_include",
    ruleIds: ["SMP-012"],
    recheckRules: ["SMP-012"],
    risk: "high",
    drafted: "rule",
    wpField: "sitemap_exclude",
    input: "fixed",
    label: "Add to sitemap",
    changeTitle: "Pages added to the sitemap",
    field: (seo) =>
      seo === "core" ? "WordPress sitemap exclusions" : `${SEO_NAME[seo]} sitemap exclusions`,
  },
};

const BY_RULE = new Map<string, FixKindDef>(
  Object.values(FIX_KINDS).flatMap((def) => def.ruleIds.map((id) => [id, def] as const)),
);

/** The fix kind for a rule, or null when Phase 3 has no automatic fix for it (guide only). */
export function kindForRule(ruleId: string): FixKindDef | null {
  return BY_RULE.get(ruleId) ?? null;
}

export const FIXABLE_RULE_IDS: readonly string[] = [...BY_RULE.keys()].sort();

/** Sitemap rules with an automatic fix (M17 auto-fix). */
export const SITEMAP_FIX_RULE_IDS: readonly string[] = FIXABLE_RULE_IDS.filter((id) =>
  id.startsWith("SMP-"),
);
