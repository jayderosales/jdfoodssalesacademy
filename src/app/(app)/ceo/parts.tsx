import Link from "next/link";
import { formatMoney } from "@/lib/money";

export const peso = (n: number | string | null | undefined) => formatMoney(Number(n ?? 0).toFixed(2));
export const pesoShort = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M` : a >= 1_000 ? `${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1)}K` : a.toFixed(0);
  return `${n < 0 ? "-" : ""}₱${s}`;
};
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const monthStartOf = (d: string) => `${d.slice(0, 7)}-01`;
export const yearStartOf = (d: string) => `${d.slice(0, 4)}-01-01`;
export const isoOr = (v: string | undefined, fallback: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : fallback);

/** A headline number that clicks through to its details. */
export function Tile({ label, value, sub, href, tone = "default" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; tone?: "default" | "good" | "warn" | "bad" }) {
  const color = tone === "bad" ? "text-danger" : tone === "warn" ? "text-amber-700" : tone === "good" ? "text-success" : "text-foreground";
  const body = (
    <>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl border bg-card p-3 transition hover:border-brand hover:shadow-sm">{body}</Link>
  ) : (
    <div className="rounded-xl border bg-card p-3">{body}</div>
  );
}

/** "+12% vs last month" with an arrow and plain-text meaning (not color alone). */
export function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  if (before <= 0) return <span>{label}: no sales to compare</span>;
  const d = Math.round(((now - before) / before) * 100);
  return <span className={d >= 0 ? "text-success" : "text-danger"}>{d >= 0 ? "▲" : "▼"} {Math.abs(d)}% {d >= 0 ? "above" : "below"} {label}</span>;
}

/** Progress toward a target, with the expected pace marker for the month. */
export function TargetBar({ actual, target, pace }: { actual: number; target: number | null; pace?: number }) {
  if (!target) return <p className="text-xs text-muted-foreground">No target set. <Link href="/ceo/targets" className="underline">Set targets</Link></p>;
  const p = Math.min(100, (actual / target) * 100);
  const behind = pace != null && p < pace;
  return (
    <div>
      <div className="relative h-2.5 w-full rounded-full bg-muted" role="img" aria-label={`${Math.round((actual / target) * 100)}% of target`}>
        <div className={`h-2.5 rounded-full ${behind ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${p}%` }} />
        {pace != null && <div className="absolute -top-1 h-4.5 w-0.5 bg-foreground/60" style={{ left: `${Math.min(100, pace)}%` }} title={`Expected by today: ${Math.round(pace)}%`} />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {peso(actual)} of {peso(target)} · <b className={behind ? "text-amber-700" : "text-foreground"}>{Math.round((actual / target) * 100)}%</b>
        {pace != null && <> · {behind ? "behind" : "on or ahead of"} pace ({Math.round(pace)}% of the month gone)</>}
      </p>
    </div>
  );
}

/**
 * Daily bars, one series in the brand color. Thin bars with rounded tops anchored to the baseline, a 2px gap,
 * recessive axis labels, a native tooltip per bar, and the full numbers in a table underneath (accessible view).
 */
export function DailyBars({ days, title }: { days: { day: string; value: number; sub?: string }[]; title: string }) {
  const max = Math.max(1, ...days.map((d) => d.value));
  const total = days.reduce((s, d) => s + d.value, 0);
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  return (
    <figure>
      <figcaption className="sr-only">{title}</figcaption>
      <div className="relative">
        <span className="absolute -top-1 right-0 text-[11px] text-muted-foreground">max {pesoShort(max)}</span>
        <div className="flex h-36 items-end gap-0.5 border-b border-border pt-4" aria-hidden>
          {days.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${fmt(d.day)}: ${peso(d.value)}${d.sub ? ` · ${d.sub}` : ""}`}>
              <div className="w-full rounded-t-[4px] bg-brand/85 group-hover:bg-brand" style={{ height: `${d.value > 0 ? Math.max(2, (d.value / max) * 100) : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{days[0] && fmt(days[0].day)}</span><span>{days.length ? fmt(days[days.length - 1].day) : ""}</span></div>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Show the numbers (total {peso(total)})</summary>
        <table className="mt-1 w-full text-xs">
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day} className="border-b border-border/50"><td className="py-0.5">{fmt(d.day)}</td><td className="py-0.5 text-right tabular-nums">{peso(d.value)}</td><td className="py-0.5 pl-2 text-muted-foreground">{d.sub}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Horizontal share bars for a breakdown (channel, brand, rep…). Labels in text ink; bar carries the magnitude. */
export function ShareBars({ rows, href }: { rows: { key: string; label: string; amount: number; sub?: string }[]; href?: (key: string) => string | null }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No sales in this period.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => {
        const link = href?.(r.key);
        return (
          <li key={r.key}>
            <div className="flex justify-between gap-2">
              <span className="truncate">{link ? <Link href={link} className="underline">{r.label}</Link> : r.label}{r.sub && <span className="text-xs text-muted-foreground"> · {r.sub}</span>}</span>
              <span className="shrink-0 tabular-nums">{peso(r.amount)} <span className="text-xs text-muted-foreground">{pct(r.amount, total)}%</span></span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-brand/80" style={{ width: `${(r.amount / max) * 100}%` }} /></div>
          </li>
        );
      })}
    </ul>
  );
}

export function TestBooksNote({ live }: { live: boolean }) {
  if (live) return null;
  return <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">Profit figures come from the accounting books, which are still in the parallel (test) run.</p>;
}
