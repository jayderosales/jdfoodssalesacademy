import Link from "next/link";
import { Card, CardTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

/** Executive risk feed: items escalated because nobody acted on them in time. Moves to the CEO Command Center in Phase 6. */
export async function RiskFeed() {
  const supabase = await createClient();
  const { data } = await supabase.from("risk_alerts").select("id, title, href, reason, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(10);
  const rows = (data as { id: number; title: string; href: string; reason: string; created_at: string }[] | null) ?? [];
  return (
    <Card className="mb-4 border-amber-300">
      <CardTitle>Escalated to you ({rows.length})</CardTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing overdue. Items appear here when nobody acts on them within 48 working hours.</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="py-2">
              <Link href={r.href || "#"} className="font-medium text-brand underline">{r.title}</Link>
              <span className="block text-xs text-muted-foreground">{r.reason} · since {formatDate(r.created_at, true)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
