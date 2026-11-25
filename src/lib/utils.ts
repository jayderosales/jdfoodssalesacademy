import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TIMEZONE = "Asia/Manila";

const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
export function formatPHP(amount: number | null | undefined) {
  return amount == null ? "—" : php.format(amount);
}

export function formatDate(value: string | Date | null | undefined, withTime = false) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(d);
}

/** YYYY-MM-DD for "today" in Manila (day boundaries for limits and streaks). */
export function manilaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}

/** UTC instant of 00:00 today in Manila (for daily limits). */
export function manilaDayStart(now = new Date()) {
  return new Date(`${manilaToday(now)}T00:00:00+08:00`);
}

/** UTC instant of 00:00 on the 1st of this month in Manila (for monthly budgets). */
export function manilaMonthStart(now = new Date()) {
  return new Date(`${manilaToday(now).slice(0, 7)}-01T00:00:00+08:00`);
}

/** A colour must be a 3- or 6-digit hex value before it is injected into CSS. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}
