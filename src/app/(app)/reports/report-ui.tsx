import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui";

/** Headline number with a label and optional context line (a stat tile, not a chart). */
export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Single-series horizontal bar for a 0–1 rate or a share of a max. One hue; the number stays in text ink. */
export function Bar({ value, max = 1, label, title }: { value: number; max?: number; label: string; title?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2" title={title ?? label}>
      <div className="h-2 min-w-16 flex-1 rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-brand-2" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums">{label}</span>
    </div>
  );
}

/** Sequential single-hue cell for a 1–5 skill average. Value is always printed, so color is never the only cue. */
export function HeatCell({ value }: { value: number | null }) {
  if (value == null) return <td className="border-b px-2 py-1.5 text-center text-xs text-muted-foreground">—</td>;
  const strength = Math.round(((value - 1) / 4) * 70) + 8; // 8%–78% of the hue
  return (
    <td
      className="border-b px-2 py-1.5 text-center text-xs font-medium tabular-nums"
      style={{ background: `color-mix(in srgb, var(--brand-secondary) ${strength}%, var(--card))` }}
      title={`${value.toFixed(1)} out of 5`}
    >
      {value.toFixed(1)}
    </td>
  );
}

export function RiskFlags({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return <span className="text-xs text-muted-foreground">On track</span>;
  return (
    <div className="flex flex-col gap-1">
      {reasons.map((r) => (
        <Badge key={r} tone="warning" className="w-fit gap-1">
          <AlertTriangle className="size-3" aria-hidden /> {r}
        </Badge>
      ))}
    </div>
  );
}

export const pct = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
export const usd = (v: number) => `$${v.toFixed(2)}`;

export function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-8 break-inside-avoid">
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      {description && <p className="mb-3 text-sm text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}
