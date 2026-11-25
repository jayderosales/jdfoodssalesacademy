export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label ?? "Progress"}
      >
        <div className="h-full rounded-full bg-brand-2 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {label !== undefined && (
        <p className="mt-1 text-xs text-muted-foreground">
          {label} · {value}/{max} ({pct}%)
        </p>
      )}
    </div>
  );
}
