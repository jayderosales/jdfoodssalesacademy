import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, Select } from "@/components/ui";
import { can, getAccess } from "@/lib/auth";
import { listLocations, listTeams } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { deleteTeam, saveTeam } from "../actions";

export const metadata = { title: "Sales teams" };

type TeamFields = { id: string; name: string; location_id: string | null; department_id: string | null };

export default async function TeamsPage() {
  const access = await getAccess();
  const canEdit = can(access, ["admin.org.manage", "academy.admin"]);
  const supabase = await createClient();
  const [teams, locations, { data: depts }, { data: members }, { data: managers }] = await Promise.all([
    listTeams(),
    listLocations(),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("profiles").select("team_id").eq("status", "active").eq("role", "rep"),
    supabase.from("team_managers").select("team_id, profiles(full_name, email)"),
  ]);
  const departments = (depts as { id: string; name: string }[] | null) ?? [];

  const repCount = new Map<string, number>();
  (members ?? []).forEach((m: { team_id: string | null }) => m.team_id && repCount.set(m.team_id, (repCount.get(m.team_id) ?? 0) + 1));
  const managerNames = new Map<string, string[]>();
  (managers ?? []).forEach((m) => {
    const row = m as unknown as { team_id: string; profiles: { full_name: string; email: string } | null };
    managerNames.set(row.team_id, [...(managerNames.get(row.team_id) ?? []), row.profiles?.full_name || row.profiles?.email || "?"]);
  });

  const fields = (t?: TeamFields) => {
    const k = t?.id ?? "new";
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {t && <input type="hidden" name="id" value={t.id} />}
        <Field label="Team name" htmlFor={`name-${k}`}>
          <Input id={`name-${k}`} name="name" defaultValue={t?.name} required />
        </Field>
        <Field label="Location" htmlFor={`loc-${k}`}>
          <Select id={`loc-${k}`} name="location_id" defaultValue={t?.location_id ?? ""}>
            <option value="">— None —</option>
            {locations
              .filter((l) => l.active)
              .map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
          </Select>
        </Field>
        <Field label="Department" htmlFor={`dep-${k}`}>
          <Select id={`dep-${k}`} name="department_id" defaultValue={t?.department_id ?? ""}>
            <option value="">— None —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </Field>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Sales teams</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">Used by the Academy for coaching and reports. Assign managers from each Sales head&apos;s user page.</p>
        {teams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet.</p>}
        <ul className="divide-y">
          {teams.map((t) => (
            <li key={t.id} className="py-3">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{t.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {repCount.get(t.id) ?? 0} active reps · Managers: {managerNames.get(t.id)?.join(", ") || "none"}
                  </span>
                </summary>
                {canEdit && (
                  <div className="mt-3 flex flex-col gap-2">
                    <ActionForm action={saveTeam} submitLabel="Save team" variant="outline">
                      {fields(t)}
                    </ActionForm>
                    <ActionForm action={deleteTeam} submitLabel="Delete team" variant="danger" confirm={`Delete team "${t.name}"?`}>
                      <input type="hidden" name="id" value={t.id} />
                    </ActionForm>
                  </div>
                )}
              </details>
            </li>
          ))}
        </ul>
      </Card>
      {canEdit && (
        <Card>
          <CardTitle>Add team</CardTitle>
          <ActionForm action={saveTeam} submitLabel="Add team">
            {fields()}
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
