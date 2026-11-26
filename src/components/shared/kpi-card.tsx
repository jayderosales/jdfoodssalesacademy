import Link from "next/link";
import { cn } from "@/lib/utils";

/** A number on a dashboard that opens the filtered list behind it. */
export function KpiCard({
  label,
  value,
  href,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-bold",
          tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : tone === "warning" ? "text-amber-600" : "text-brand",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = "block rounded-xl border bg-card p-4 shadow-sm";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-brand")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
