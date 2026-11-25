import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Alert, Card, CardTitle, Field, Input, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { setPassword, updateName } from "./actions";

export const metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ setPassword?: string }> }) {
  const { setPassword: mustSet } = await searchParams;
  const profile = await requireUser();

  return (
    <>
      <PageHeader title="My account" description={`${ROLE_LABEL[profile.role]} · ${profile.email}`} />
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
      </div>
    </>
  );
}
