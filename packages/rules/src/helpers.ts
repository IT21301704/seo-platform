import { nodeTypes } from "@seo/crawler";
import type { JsonLdNode, PageFacts, SiteFacts, SitePage } from "@seo/crawler";

/** schema.org subtypes we treat as their parent type. */
const SUBTYPES: Record<string, string[]> = {
  Organization: [
    "Organization",
    "Corporation",
    "OnlineStore",
    "OnlineBusiness",
    "LocalBusiness",
    "Store",
    "Restaurant",
    "ProfessionalService",
    "HomeAndConstructionBusiness",
    "HealthAndBeautyBusiness",
    "FoodEstablishment",
    "LodgingBusiness",
  ],
  LocalBusiness: [
    "LocalBusiness",
    "Store",
    "Restaurant",
    "ProfessionalService",
    "HomeAndConstructionBusiness",
    "HealthAndBeautyBusiness",
    "FoodEstablishment",
    "LodgingBusiness",
    "Hotel",
    "Dentist",
    "AutoRepair",
  ],
  Article: ["Article", "BlogPosting", "NewsArticle", "TechArticle", "Report"],
};

/** JSON-LD nodes of a page, or null when any JSON-LD block is invalid (SD-001 reports that). */
export function schemaNodes(facts: PageFacts): JsonLdNode[] | null {
  if (facts.jsonLd.some((b) => !b.ok)) return null;
  return facts.jsonLd.flatMap((b) => b.nodes);
}

export function isType(node: JsonLdNode, type: string): boolean {
  const accepted = SUBTYPES[type] ?? [type];
  return nodeTypes(node).some((t) => accepted.includes(t));
}

export function nodesOfType(facts: PageFacts, type: string): JsonLdNode[] | null {
  const nodes = schemaNodes(facts);
  return nodes === null ? null : nodes.filter((n) => isType(n, type));
}

export function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

export function obj(value: unknown): JsonLdNode | null {
  if (Array.isArray(value)) return obj(value[0]);
  return value && typeof value === "object" ? (value as JsonLdNode) : null;
}

export function list(value: unknown): JsonLdNode[] {
  const items = Array.isArray(value) ? value : [value];
  return items.filter((v): v is JsonLdNode => v !== null && typeof v === "object");
}

/** Lower-case, collapse whitespace, unify quotes: for "does the page show this text" checks. */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

/** Final HTTP status we observed for an internal URL (redirects followed), or null if unknown. */
export function knownStatus(site: SiteFacts, url: string): number | null {
  return site.pageByUrl.get(url)?.record.status ?? null;
}

export function isNoindex(page: SitePage): boolean {
  return page.noindex;
}

export function hasDirective(facts: PageFacts, ...directives: string[]): boolean {
  return facts.robotsDirectives.some((d) => directives.includes(d));
}

/** Groups items by key; returns only keys shared by 2+ items. */
export function duplicates<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return new Map([...groups].filter(([, g]) => g.length > 1));
}

export const LANG_CODE = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i;
