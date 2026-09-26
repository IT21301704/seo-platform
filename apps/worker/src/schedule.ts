// Time-zone aware schedule arithmetic (no external libraries): crawls and Google syncs run at a
// fixed local time in the project's time zone.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface LocalParts {
  weekday: number;
  hour: number;
  minute: number;
  date: string;
}

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    weekday: WEEKDAYS.indexOf(parts["weekday"] ?? "Sun"),
    hour: Number(parts["hour"]),
    minute: Number(parts["minute"]),
    date: `${parts["year"]}-${parts["month"]}-${parts["day"]}`,
  };
}

/**
 * Next instant after `now` when the local clock in `timeZone` shows hour:00 (and, if given, on
 * that weekday, 0 = Sunday). Steps in 15-minute increments, so half-hour offsets (e.g. India) work.
 */
export function nextLocalTime(now: Date, timeZone: string, hour: number, weekday?: number): Date {
  const step = 15 * 60_000;
  let t = Math.ceil((now.getTime() + 1) / step) * step;
  for (let i = 0; i < 8 * 24 * 4; i++, t += step) {
    const p = localParts(new Date(t), timeZone);
    if (p.hour === hour && p.minute === 0 && (weekday === undefined || p.weekday === weekday))
      return new Date(t);
  }
  throw new Error(`No ${hour}:00 found in ${timeZone}`);
}

export const CRAWL_HOUR = 2;
export const SUMMARY_HOUR = 8;
export const MONDAY = 1;

/** Next scheduled crawl for a project: daily at 02:00 or weekly on Monday at 02:00 local time. */
export function nextCrawlAt(
  frequency: "manual" | "daily" | "weekly",
  timeZone: string,
  now: Date,
): Date | null {
  if (frequency === "manual") return null;
  return nextLocalTime(now, timeZone, CRAWL_HOUR, frequency === "weekly" ? MONDAY : undefined);
}

/** IANA time zone for a target country (used until a project sets its own). */
export const COUNTRY_TIMEZONE: Record<string, string> = {
  LK: "Asia/Colombo",
  IN: "Asia/Kolkata",
  GB: "Europe/London",
  US: "America/New_York",
  AU: "Australia/Sydney",
  SG: "Asia/Singapore",
  AE: "Asia/Dubai",
  CA: "America/Toronto",
};
