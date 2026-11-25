import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { listTeams } from "@/lib/org";
import { siteUrl } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { createSignupLink, setSignupLinkActive } from "./actions";
import { CopyButton } from "./copy-button";

export const metadata = { title: "Sign-up links" };

interface LinkRow {
  id: string;
  token: string;
  team_id: string;
  expires_at: string;
  max_uses: number | null;
  uses: number;
  active: boolean;
  created_at: string;
}

export default async function SignupLinksPage() {
  const me = await requireStaff();
  const supabase = await createClient();
  const [teams, { data: links }, { data: managed }] = await Promise.all([
    listTeams(),
    supabase.from("signup_links").select("*").order("created_at", { ascending: false }),
    supabase.from("team_managers").select("team_id").eq("manager_id", me.id),
  ]);
  const allowedTeams = me.role === "owner" ? teams : teams.filter((t) => (managed ?? []).some((m: { team_id: string }) => m.team_id === t.id));
  const teamLabel = new Map(teams.map((t) => [t.id, t.label]));
  const rows = (links ?? []) as LinkRow[];
  const now = Date.now();

  return (
    <>
      <PageHeader title="Sign-up links" description="Share a link so new salespeople can create their own account on your team." />
      <div className="mb-4">
        <Alert>
          Anyone with an active link can join the team as a <strong>Salesperson</strong>. Share it only with your new hires, for example in a private message, not in a public group. Switch a link off once it isn&apos;t needed.
        </Alert>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Links</CardTitle>
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No links yet. Create one on the right.</p>}
          <ul className="divide-y">
            {rows.map((l) => {
              const expired = new Date(l.expires_at).getTime() < now;
              const full = l.max_uses != null && l.uses >= l.max_uses;
              const usable = l.active && !expired && !full;
              const url = `${siteUrl()}/join/${l.token}`;
              return (
                <li key={l.id} className="py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{teamLabel.get(l.team_id) ?? "Team"}</span>
                    {usable ? <Badge tone="success">active</Badge> : <Badge>{!l.active ? "switched off" : expired ? "expired" : "used up"}</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {l.uses}{l.max_uses != null ? ` of ${l.max_uses}` : ""} sign-ups · expires {formatDate(l.expires_at)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input readOnly value={url} aria-label="Sign-up link" className={`font-mono text-xs ${usable ? "" : "opacity-60"}`} />
                    <div className="flex gap-2">
                      {usable && <CopyButton text={url} />}
                      {!expired && (
                        <form action={setSignupLinkActive}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="active" value={String(!l.active)} />
                          <button className="min-h-8 rounded-lg border px-3 text-xs hover:bg-muted">{l.active ? "Switch off" : "Switch on"}</button>
                        </form>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="h-fit">
          <CardTitle>New link</CardTitle>
          {allowedTeams.length === 0 ? (
            <p className="text-sm text-muted-foreground">You don&apos;t manage any team yet. Ask the owner to assign you one.</p>
          ) : (
            <ActionForm action={createSignupLink} submitLabel="Create link">
              <Field label="Team" htmlFor="team_id">
                <Select id="team_id" name="team_id" defaultValue={allowedTeams[0]?.id}>
                  {allowedTeams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Valid for (days)" htmlFor="days">
                <Input id="days" name="days" type="number" min={1} max={90} defaultValue={14} />
              </Field>
              <Field label="Maximum sign-ups" htmlFor="max_uses" hint="Leave empty for no limit. Tip: set it to the number of people you're hiring.">
                <Input id="max_uses" name="max_uses" type="number" min={1} max={500} placeholder="No limit" />
              </Field>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
