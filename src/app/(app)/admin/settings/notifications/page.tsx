import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle, Field, Input, PageHeader } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveEscalation, saveNotificationRule } from "../engine-actions";

export const metadata = { title: "Notifications & escalation" };

export default async function NotificationSettingsPage() {
  await requirePermission("admin.settings.manage");
  const s = await getSettings();
  const supabase = await createClient();
  const [{ data: rules }, { data: esc }] = await Promise.all([
    supabase.from("notification_rules").select("*").order("label"),
    supabase.from("escalation_rules").select("*, escalation_sources(label)").order("item_type").order("level"),
  ]);

  return (
    <>
      <PageHeader title="Notifications & escalation" actions={<Link href="/admin/settings" className="text-sm text-brand underline">All settings</Link>} />
      <div className="mb-4 rounded-lg border bg-muted p-3 text-sm">
        Email delivery is <strong>{s?.email_enabled ? "on" : "off"}</strong>.{" "}
        {!s?.email_enabled && "Everything arrives in the app's bell. Email switches on once the Resend account and jdfoods.ph DNS records are set up (see docs/SETUP_ACCOUNTS.md)."}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Escalation ladder</CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">Counted in working hours. Level 1 goes to the person&apos;s supervisor (or straight to executives if none is set); level 2 goes to the CEO and the risk feed.</p>
          <ul className="space-y-3">
            {((esc as { item_type: string; level: number; after_working_hours: number; target: string; active: boolean; escalation_sources: { label: string } | null }[] | null) ?? []).map((e) => (
              <li key={`${e.item_type}-${e.level}`}>
                <ActionForm action={saveEscalation} submitLabel="Save" variant="outline" className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="item_type" value={e.item_type} />
                  <input type="hidden" name="level" value={e.level} />
                  <div className="w-full text-sm font-medium">
                    {e.escalation_sources?.label ?? e.item_type}: level {e.level} → {e.target === "supervisor" ? "supervisor" : "executives"}
                  </div>
                  <Field label="After (working hours)" htmlFor={`h-${e.item_type}-${e.level}`}>
                    <Input id={`h-${e.item_type}-${e.level}`} name="after_working_hours" type="number" min={1} max={500} defaultValue={e.after_working_hours} className="w-28" />
                  </Field>
                  <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={e.active} className="size-4" /> Active</label>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Messages</CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">Words in double curly brackets (like {"{{title}}"}) are filled in automatically.</p>
          <ul className="space-y-2">
            {((rules as { event_type: string; label: string; title_template: string; body_template: string; email: boolean; mandatory: boolean; active: boolean }[] | null) ?? []).map((r) => (
              <li key={r.event_type} className="rounded border p-2">
                <details>
                  <summary className="cursor-pointer text-sm">
                    {r.label} {r.mandatory && <Badge>always on</Badge>} {!r.active && <Badge>off</Badge>}
                  </summary>
                  <div className="mt-2">
                    <ActionForm action={saveNotificationRule} submitLabel="Save" variant="outline">
                      <input type="hidden" name="event_type" value={r.event_type} />
                      <Field label="Title" htmlFor={`t-${r.event_type}`}><Input id={`t-${r.event_type}`} name="title_template" defaultValue={r.title_template} /></Field>
                      <Field label="Text" htmlFor={`b-${r.event_type}`}><Input id={`b-${r.event_type}`} name="body_template" defaultValue={r.body_template} /></Field>
                      <div className="flex gap-4 text-sm">
                        <label className="flex items-center gap-1"><input type="checkbox" name="email" defaultChecked={r.email} className="size-4" /> Also email</label>
                        <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={r.active} className="size-4" /> Active</label>
                      </div>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
