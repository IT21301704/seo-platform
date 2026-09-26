/** URL Inspection API limits (per Search Console property). */
export const URL_INSPECTION_DAILY_LIMIT = 2000;
export const URL_INSPECTION_PER_MINUTE = 600;
/** Re-inspect a URL after this many days. */
export const INSPECTION_MAX_AGE_DAYS = 7;

/** Google quota days follow Pacific time. */
export function quotaDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface InspectionCandidate {
  url: string;
  /** Clicks (GSC) or sessions (GA4); higher is inspected first. */
  traffic: number;
  lastInspectedAt: Date | null;
}

/**
 * Picks today's batch: never-inspected URLs first, then stale ones; highest traffic first, then
 * URL order. Fresh inspections are skipped. Never more than the remaining daily quota.
 */
export function planInspections(
  candidates: InspectionCandidate[],
  remaining: number,
  now: Date,
  maxAgeDays = INSPECTION_MAX_AGE_DAYS,
): string[] {
  if (remaining <= 0) return [];
  const staleBefore = now.getTime() - maxAgeDays * 86_400_000;
  const due = candidates.filter(
    (c) => c.lastInspectedAt === null || c.lastInspectedAt.getTime() < staleBefore,
  );
  const rank = (c: InspectionCandidate) => (c.lastInspectedAt === null ? 0 : 1);
  return [...new Map(due.map((c) => [c.url, c])).values()]
    .sort((a, b) => rank(a) - rank(b) || b.traffic - a.traffic || a.url.localeCompare(b.url))
    .slice(0, remaining)
    .map((c) => c.url);
}

/** Spaces calls so no more than `perMinute` happen in any minute. */
export class RateLimiter {
  private next = 0;
  constructor(
    private readonly perMinute: number,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
    private readonly clock: () => number = Date.now,
  ) {}

  async wait(): Promise<void> {
    const now = this.clock();
    const slot = Math.max(now, this.next);
    this.next = slot + 60_000 / this.perMinute;
    if (slot > now) await this.sleep(slot - now);
  }
}

/** Search analytics range: 28 days ending 3 days ago (GSC data lags 2-3 days). */
export function gscRange(now: Date): { startDate: string; endDate: string } {
  const day = 86_400_000;
  const end = new Date(now.getTime() - 3 * day);
  const start = new Date(end.getTime() - 27 * day);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

/** GA4 range: last 28 full days. */
export function ga4Range(now: Date): { startDate: string; endDate: string } {
  const day = 86_400_000;
  const end = new Date(now.getTime() - day);
  const start = new Date(end.getTime() - 27 * day);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
