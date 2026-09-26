import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number): string => String(n).padStart(2, "0");

/** "24 Sep" — fixed English month names in UTC, so server and browser render identically. */
export const formatShortDate = (d: Date | string): string => {
  const date = new Date(d);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
};
/** "24 Sep 2026" */
export const formatDate = (d: Date | string): string =>
  `${formatShortDate(d)} ${new Date(d).getUTCFullYear()}`;
/** "24 Sep 2026, 10:42 UTC" */
export const formatDateTime = (d: Date | string): string => {
  const date = new Date(d);
  return `${formatDate(date)}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
};
/** "10:42:05" */
export const formatTime = (d: Date | string): string => {
  const date = new Date(d);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
};
export const formatNumber = (n: number): string => n.toLocaleString("en-US");

/** "https://example-store.com/about/" → "/about/" for display. */
export function pathOf(url: string | null, fallback = "Whole site"): string {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** "1 page", "3 pages". */
export const plural = (n: number, word: string, many = `${word}s`): string =>
  `${formatNumber(n)} ${n === 1 ? word : many}`;

/** "Mon 28 Sep 2026, 02:00" in a given IANA time zone. */
export function formatZoned(d: Date | string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(d))
      .map((p) => [p.type, p.value]),
  );
  return `${parts["weekday"]} ${parts["day"]} ${MONTHS[Number(parts["month"]) - 1]} ${parts["year"]}, ${parts["hour"]}:${parts["minute"]}`;
}
