import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const shortFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export const formatDate = (d: Date | string): string => dateFmt.format(new Date(d));
export const formatDateTime = (d: Date | string): string => `${dateTimeFmt.format(new Date(d))} UTC`;
export const formatShortDate = (d: Date | string): string => shortFmt.format(new Date(d));
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
