/** Date range presets in Manila time (YYYY-MM-DD), used by the DateRangePicker and report filters. */
export type RangePreset = "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "this_quarter" | "this_year";

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_year: "This year",
};

function manilaParts(now: Date) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now); // YYYY-MM-DD
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** Weeks start on Monday. */
export function presetRange(preset: RangePreset, now = new Date()): { from: string; to: string } {
  const { y, m, d } = manilaParts(now);
  const today = new Date(Date.UTC(y, m - 1, d));
  switch (preset) {
    case "today":
      return { from: iso(y, m, d), to: iso(y, m, d) };
    case "yesterday":
      return { from: iso(y, m, d - 1), to: iso(y, m, d - 1) };
    case "this_week": {
      const dow = (today.getUTCDay() + 6) % 7; // 0 = Monday
      return { from: iso(y, m, d - dow), to: iso(y, m, d) };
    }
    case "this_month":
      return { from: iso(y, m, 1), to: iso(y, m, d) };
    case "last_month":
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "this_quarter": {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: iso(y, qm, 1), to: iso(y, m, d) };
    }
    case "this_year":
      return { from: iso(y, 1, 1), to: iso(y, m, d) };
  }
}
