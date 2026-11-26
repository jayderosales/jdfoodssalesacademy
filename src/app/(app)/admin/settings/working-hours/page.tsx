import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle, Field, Input, PageHeader } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addHoliday, removeHoliday, saveWorkingHours, verifyHoliday } from "../engine-actions";

export const metadata = { title: "Working hours & holidays" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function WorkingHoursPage() {
  await requirePermission("admin.settings.manage");
  const s = await getSettings();
  const supabase = await createClient();
  const { data } = await supabase.from("holidays").select("day, name, needs_verification").gte("day", new Date().toISOString().slice(0, 10)).order("day");
  const holidays = (data as { day: string; name: string; needs_verification: boolean }[] | null) ?? [];

  return (
    <>
      <PageHeader
        title="Working hours & holidays"
        description="Escalation clocks count only these hours (e.g. 24 working hours ≈ 2½ working days)."
        actions={<Link href="/admin/settings" className="text-sm text-brand underline">All settings</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Working hours (Manila time)</CardTitle>
          <ActionForm action={saveWorkingHours} submitLabel="Save working hours">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Working days</legend>
              <div className="flex flex-wrap gap-3">
                {DAYS.map((d, i) => (
                  <label key={d} className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="work_days" value={i + 1} defaultChecked={s?.work_days?.includes(i + 1)} className="size-4" /> {d}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start" htmlFor="work_start"><Input id="work_start" name="work_start" type="time" defaultValue={s?.work_start?.slice(0, 5)} /></Field>
              <Field label="End" htmlFor="work_end"><Input id="work_end" name="work_end" type="time" defaultValue={s?.work_end?.slice(0, 5)} /></Field>
            </div>
          </ActionForm>
        </Card>
        <Card>
          <CardTitle>Upcoming holidays</CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            The starter list follows the usual Philippine calendar. Holidays that move each year are proclaimed by the President, so check each one and tick it as checked.
          </p>
          <ul className="mb-4 divide-y text-sm">
            {holidays.map((h) => (
              <li key={h.day} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {formatDate(h.day)} · {h.name} {h.needs_verification && <Badge tone="warning">check date</Badge>}
                </span>
                <span className="flex gap-2">
                  {h.needs_verification && (
                    <ActionForm action={verifyHoliday} submitLabel="Checked" variant="outline" className="flex">
                      <input type="hidden" name="day" value={h.day} />
                    </ActionForm>
                  )}
                  <ActionForm action={removeHoliday} submitLabel="Remove" variant="outline" className="flex" confirm={`Remove ${h.name}?`}>
                    <input type="hidden" name="day" value={h.day} />
                  </ActionForm>
                </span>
              </li>
            ))}
          </ul>
          <ActionForm action={addHoliday} submitLabel="Add holiday">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="day"><Input id="day" name="day" type="date" required /></Field>
              <Field label="Name" htmlFor="hname"><Input id="hname" name="name" required placeholder="e.g. Eid'l Fitr" /></Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
