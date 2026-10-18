// Plans (REQUIREMENTS Part G "Plans & billing"). Prices are placeholders to validate with
// customers; limits marked [LIMIT] in the wireframe use the values below (docs/decisions.md).

export type PlanId = "free" | "starter" | "pro" | "agency";

export type CrawlFrequencyLimit = "manual" | "weekly" | "daily";

export interface Plan {
  id: PlanId;
  name: string;
  /** Shown on screen 12 until prices are set. */
  price: string;
  projects: number;
  pagesPerCrawl: number;
  /** Fastest automatic crawl schedule allowed. */
  crawl: CrawlFrequencyLimit;
  /** Which auto-fixes may be published: none, low-risk only, or all (with rollback). */
  autoFix: "none" | "low" | "all";
  /** Published fixes per calendar month (UTC). */
  autoFixesPerMonth: number;
  /** Copilot questions per calendar month (UTC), for the whole organization. */
  copilotQuestions: number;
  searchConsole: boolean;
  alerts: boolean;
  authority: boolean;
  whiteLabel: boolean;
  teamRoles: boolean;
  /** Bullet points on the plan card. */
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: "[PRICE]",
    projects: 1,
    pagesPerCrawl: 100,
    crawl: "manual",
    autoFix: "none",
    autoFixesPerMonth: 0,
    copilotQuestions: 0,
    searchConsole: false,
    alerts: false,
    authority: false,
    whiteLabel: false,
    teamRoles: false,
    features: ["1 project", "100 pages per crawl", "Manual crawls", "Score + top 10 issues"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    price: "[PRICE]",
    projects: 3,
    pagesPerCrawl: 1_000,
    crawl: "weekly",
    autoFix: "low",
    autoFixesPerMonth: 200,
    copilotQuestions: 0,
    searchConsole: true,
    alerts: false,
    authority: false,
    whiteLabel: false,
    teamRoles: false,
    features: [
      "3 projects",
      "1,000 pages per crawl",
      "Weekly crawls",
      "Low-risk auto-fix",
      "Search Console, history, PDF",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "[PRICE]",
    projects: 10,
    pagesPerCrawl: 10_000,
    crawl: "daily",
    autoFix: "all",
    autoFixesPerMonth: 1_000,
    copilotQuestions: 200,
    searchConsole: true,
    alerts: true,
    authority: true,
    whiteLabel: false,
    teamRoles: false,
    features: [
      "10 projects",
      "10,000 pages per crawl",
      "Daily crawls",
      "All auto-fixes + rollback",
      "Copilot, alerts, Authority",
    ],
  },
  agency: {
    id: "agency",
    name: "Agency",
    price: "[PRICE]",
    projects: 50,
    pagesPerCrawl: 50_000,
    crawl: "daily",
    autoFix: "all",
    autoFixesPerMonth: 5_000,
    copilotQuestions: 1_000,
    searchConsole: true,
    alerts: true,
    authority: true,
    whiteLabel: true,
    teamRoles: true,
    features: [
      "50+ projects",
      "50,000 pages per crawl",
      "Daily crawls",
      "White-label reports",
      "Team roles, client workspaces",
    ],
  },
};

export const PLAN_ORDER: readonly PlanId[] = ["free", "starter", "pro", "agency"];

export const isPlanId = (value: string): value is PlanId => value in PLANS;

const RANK: Record<CrawlFrequencyLimit, number> = { manual: 0, weekly: 1, daily: 2 };

/** The crawl schedule a plan allows: the requested one, or the fastest the plan permits. */
export function allowedFrequency(plan: Plan, requested: CrawlFrequencyLimit): CrawlFrequencyLimit {
  return RANK[requested] <= RANK[plan.crawl] ? requested : plan.crawl;
}

/** Whether a plan may publish fixes of this risk level. */
export function planAllowsFix(plan: Plan, risk: "low" | "medium" | "high"): boolean {
  if (plan.autoFix === "none") return false;
  return plan.autoFix === "all" || risk === "low";
}

/** Start of the usage month (UTC) for monthly limits. */
export function usageMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
