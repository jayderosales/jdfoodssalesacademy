import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, CardTitle, Field, Input, PageHeader } from "@/components/ui";
import { getAccess, requireUser } from "@/lib/auth";
import { getMyRoleNames } from "@/lib/rbac/queries";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { forgetDevice, setPassword, updateName } from "./actions";

export const metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ setPassword?: string }> }) {
  const { setPassword: mustSet } = await searchParams;
  const profile = await requireUser();
  const access = await getAccess();
  const supabase = await createClient();
  const [roleNames, { data: devices }, { data: logins }] = await Promise.all([
    getMyRoleNames(profile.id),
    supabase.from("user_devices").select("device_id, label, first_seen, last_seen, last_ip").eq("user_id", profile.id).order("last_seen", { ascending: false }),
    supabase.from("login_events").select("at, method, success, reason, user_agent").eq("user_id", profile.id).order("at", { ascending: false }).limit(8),
  ]);

  return (
    <>
      <PageHeader title="My account" description={profile.email} />
      {mustSet && (
        <div className="mb-4">
          <Alert>Welcome! Set a password below so you can sign in with your email and password next time.</Alert>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Profile</CardTitle>
          <ActionForm action={updateName} submitLabel="Save name">
            <Field label="Full name" htmlFor="full_name">
              <Input id="full_name" name="full_name" defaultValue={profile.full_name} required autoComplete="name" />
            </Field>
          </ActionForm>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Roles</dt>
            <dd>{roleNames.join(", ") || "None"}</dd>
            <dt className="text-muted-foreground">Hire date</dt>
            <dd>{formatDate(profile.hire_date)}</dd>
            <dt className="text-muted-foreground">Privacy notice accepted</dt>
            <dd>
              {formatDate(profile.consent_at)} ({profile.consent_version}){" "}
              <Link href="/consent" className="text-brand underline">view</Link>
            </dd>
          </dl>
        </Card>
        <Card>
          <CardTitle>{mustSet ? "Set your password" : "Change password"}</CardTitle>
          <ActionForm action={setPassword} submitLabel="Save password">
            <Field label="New password" htmlFor="password" hint="At least 8 characters.">
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
            </Field>
            <Field label="Confirm password" htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
            </Field>
          </ActionForm>
        </Card>
        <Card>
          <CardTitle>Two-step sign-in</CardTitle>
          {access.mfaRequired ? (
            <p className="text-sm">
              <Badge tone="success">on</Badge> You confirm each sign-in with a code from your authenticator app. If you change phones, ask an
              administrator to reset it, then set it up again at your next sign-in.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not required for your account.</p>
          )}
        </Card>
        <Card>
          <CardTitle>Your devices</CardTitle>
          <p className="mb-2 text-xs text-muted-foreground">We email you when your account is used on a device that isn&apos;t listed here.</p>
          {(devices ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {(devices as { device_id: string; label: string; first_seen: string; last_seen: string; last_ip: string }[]).map((d) => (
                <li key={d.device_id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {d.label}
                    <span className="block text-xs text-muted-foreground">Last used {formatDate(d.last_seen, true)}{d.last_ip ? ` · ${d.last_ip}` : ""}</span>
                  </span>
                  <ActionForm action={forgetDevice} submitLabel="Forget" variant="outline" className="flex">
                    <input type="hidden" name="device_id" value={d.device_id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>Recent sign-ins</CardTitle>
          {(logins ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {(logins as { at: string; method: string; success: boolean; reason: string; user_agent: string }[]).map((l) => (
                <li key={l.at + l.method} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{formatDate(l.at, true)} · {l.method.replace("_", " ")}</span>
                  {l.success ? <Badge tone="success">ok</Badge> : <Badge tone="danger">{l.reason || "failed"}</Badge>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Don&apos;t recognise something? Change your password and tell your administrator.</p>
        </Card>
      </div>
    </>
  );
}
