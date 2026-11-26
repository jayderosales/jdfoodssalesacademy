import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Standard layout for a document/record page: back link, title + number, status, actions, then tabs.
 * Tabs are links (?tab=…) so each tab is a normal server-rendered page section.
 */
export function RecordPage({
  backHref,
  backLabel,
  title,
  subtitle,
  status,
  actions,
  tabs,
  activeTab,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: { key: string; label: string; count?: number }[];
  activeTab?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Link href={backHref} className="text-sm text-brand underline">← {backLabel}</Link>
      <div className="mb-4 mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
            {title} {status}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {tabs && tabs.length > 1 && (
        <nav aria-label="Sections" className="mb-4 flex gap-1 overflow-x-auto border-b">
          {tabs.map((t) => {
            const active = (activeTab ?? tabs[0].key) === t.key;
            return (
              <Link
                key={t.key}
                href={`?tab=${t.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm",
                  active ? "border-brand font-semibold text-brand" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {t.count != null && <span className="ml-1 text-xs text-muted-foreground">({t.count})</span>}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}
