"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Field, Input } from "@/components/ui";
import { joinWithLink, type JoinState } from "./actions";

export function JoinForm({ token, consentText }: { token: string; consentText: React.ReactNode }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinWithLink, {});

  if (state.done) {
    return (
      <Alert tone="success">
        Almost done! We sent a confirmation link to <strong>{state.email}</strong>. Open it on this phone or computer to finish
        signing up. If it isn&apos;t there in a few minutes, check your spam folder.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Full name" htmlFor="full_name">
        <Input id="full_name" name="full_name" autoComplete="name" required />
      </Field>
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required />
      </Field>
      <Field label="Create a password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <details className="rounded-lg border bg-muted/50 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Data privacy notice</summary>
        <div className="mt-2 max-h-60 overflow-y-auto">{consentText}</div>
      </details>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" required className="mt-1 size-4" />
        <span>I have read and agree to the data privacy notice.</span>
      </label>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating your account…" : "Create my account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account? <Link href="/login" className="text-brand underline">Sign in</Link>
      </p>
    </form>
  );
}
