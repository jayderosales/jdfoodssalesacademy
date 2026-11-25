import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { listBranches, listTeams } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { createBranch, createTeam, deleteBranch, deleteTeam, renameBranch, updateTeam } from "./actions";

export const metadata = { title: "Teams & branches" };

export default async function TeamsPage() {
  await requireOwner();
  const supabase = await createClient();
  const [branches, teams, { data: members }, { data: managers }] = await Promise.all([
    listBranches(),
    listTeams(),
    supabase.from("profiles").select("team_id").eq("status", "active").eq("role", "rep"),
    supabase.from("team_managers").select("team_id, profiles(full_name, email)"),
  ]);

  const repCount = new Map<string, number>();
  (members ?? []).forEach((m: { team_id: string | null }) => m.team_id && repCount.set(m.team_id, (repCount.get(m.team_id) ?? 0) + 1));
  const managerNames = new Map<string, string[]>();
  (managers ?? []).forEach((m) => {
    const row = m as unknown as { team_id: string; profiles: { full_name: string; email: string } | null };
    const list = managerNames.get(row.team_id) ?? [];
    list.push(row.profiles?.full_name || row.profiles?.email || "?");
    managerNames.set(row.team_id, list);
  });

  return (
    <>
      <PageHeader title="Teams & branches" description="Assign managers to teams from each manager's user page." />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Teams</CardTitle>
            {teams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet.</p>}
            <ul className="divide-y">
              {teams.map((t) => (
                <li key={t.id} className="py-4">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {repCount.get(t.id) ?? 0} active reps · Managers: {managerNames.get(t.id)?.join(", ") || "none"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <ActionForm action={updateTeam} submitLabel="Save" variant="outline" className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                      <input type="hidden" name="id" value={t.id} />
                      <Input name="name" defaultValue={t.name} aria-label="Team name" required />
                      <Select name="branch_id" defaultValue={t.branch_id ?? ""} aria-label="Branch">
                        <option value="">No branch</option>
                        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </Select>
                    </ActionForm>
                    <ActionForm action={deleteTeam} submitLabel="Delete" variant="danger" className="flex flex-col gap-2" confirm={`Delete team "${t.name}"?`}>
                      <input type="hidden" name="id" value={t.id} />
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Add team</CardTitle>
            <ActionForm action={createTeam} submitLabel="Add team">
              <Field label="Team name" htmlFor="team_name">
                <Input id="team_name" name="name" required />
              </Field>
              <Field label="Branch" htmlFor="team_branch">
                <Select id="team_branch" name="branch_id" defaultValue={branches[0]?.id ?? ""}>
                  <option value="">No branch</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            </ActionForm>
          </Card>

          <Card>
            <CardTitle>Branches</CardTitle>
            <ul className="mb-4 space-y-3">
              {branches.map((b) => (
                <li key={b.id} className="flex items-end gap-2">
                  <ActionForm action={renameBranch} submitLabel="Save" variant="outline" className="flex flex-1 items-end gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <Input name="name" defaultValue={b.name} aria-label="Branch name" required />
                  </ActionForm>
                  <ActionForm action={deleteBranch} submitLabel="Delete" variant="danger" className="flex" confirm={`Delete branch "${b.name}"?`}>
                    <input type="hidden" name="id" value={b.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
            <ActionForm action={createBranch} submitLabel="Add branch">
              <Field label="New branch name" htmlFor="branch_name">
                <Input id="branch_name" name="name" required placeholder="e.g. Cebu" />
              </Field>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
