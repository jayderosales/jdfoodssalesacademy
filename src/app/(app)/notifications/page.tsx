import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { MarkAllRead } from "@/components/notification-live";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { getSettings, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { savePreferences } from "./actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data }, { data: rules }, { data: prefs }, settings] = await Promise.all([
    supabase.from("notifications").select("id, type, payload, priority, read_at, created_at").eq("user_id", me.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("notification_rules").select("event_type, label, in_app, email, mandatory").eq("active", true).order("label"),
    supabase.from("notification_preferences").select("event_type, in_app, email").eq("user_id", me.id),
    getSettings(),
  ]);
  const rows = (data as { id: string; type: string; payload: { title?: string; body?: string }; priority: string; read_at: string | null; created_at: string }[] | null) ?? [];
  const pref = new Map(((prefs as { event_type: string; in_app: boolean; email: boolean }[] | null) ?? []).map((p) => [p.event_type, p]));
  const optional = ((rules as { event_type: string; label: string; in_app: boolean; email: boolean; mandatory: boolean }[] | null) ?? []);

  return (
    <>
      <PageHeader title="Notifications" actions={rows.some((r) => !r.read_at) ? <MarkAllRead /> : undefined} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>}
          <ul className="divide-y">
            {rows.map((n) => (
              <li key={n.id} className={n.read_at ? "" : "bg-muted/50"}>
                <Link href={`/notifications/open/${n.id}`} className="block px-2 py-3 text-sm hover:bg-muted">
                  <span className="block font-medium">
                    {n.priority === "high" && <span className="mr-1 text-danger">●</span>}
                    {n.payload.title ?? n.type}
                  </span>
                  {n.payload.body && <span className="block text-muted-foreground">{n.payload.body}</span>}
                  <span className="block text-xs text-muted-foreground">{formatDate(n.created_at, true)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>What you get notified about</CardTitle>
          {!settings?.email_enabled && <p className="mb-3 text-xs text-muted-foreground">Email notifications aren&apos;t switched on for the company yet, so everything arrives here in the app.</p>}
          <ActionForm action={savePreferences} submitLabel="Save">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Notification</th><th>In app</th><th>Email</th></tr></thead>
              <tbody>
                {optional.map((r) => (
                  <tr key={r.event_type} className="border-t">
                    <td className="py-2 pr-2">{r.label}{r.mandatory && <span className="block text-[11px] text-muted-foreground">Always on</span>}</td>
                    <td><input type="checkbox" name={`in_app:${r.event_type}`} defaultChecked={r.mandatory || (pref.get(r.event_type)?.in_app ?? true)} disabled={r.mandatory || !r.in_app} className="size-4" aria-label={`${r.label} in app`} /></td>
                    <td><input type="checkbox" name={`email:${r.event_type}`} defaultChecked={r.mandatory || (pref.get(r.event_type)?.email ?? true)} disabled={r.mandatory || !r.email} className="size-4" aria-label={`${r.label} by email`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
