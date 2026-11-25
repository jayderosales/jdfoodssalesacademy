"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { sendMagicLink, sendPasswordReset, signInWithPassword, type FormState } from "./actions";

type Mode = "password" | "magic" | "reset";

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<Mode>("password");
  const action = mode === "password" ? signInWithPassword : mode === "magic" ? sendMagicLink : sendPasswordReset;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(["password", "magic"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-9 rounded-md ${mode === m ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"}`}
          >
            {m === "password" ? "Password" : "Email link"}
          </button>
        ))}
      </div>

      {/* key resets the form state when switching modes */}
      <form key={mode} action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Work email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        </Field>

        {mode === "password" && (
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
        )}

        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.message && <Alert tone="success">{state.message}</Alert>}

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? "Please wait…" : mode === "password" ? "Sign in" : mode === "magic" ? "Email me a sign-in link" : "Send reset link"}
        </Button>
      </form>

      <div className="text-center text-sm">
        {mode === "reset" ? (
          <button type="button" className="text-brand underline" onClick={() => setMode("password")}>
            Back to sign in
          </button>
        ) : (
          <button type="button" className="text-muted-foreground underline" onClick={() => setMode("reset")}>
            Forgot password?
          </button>
        )}
      </div>
    </div>
  );
}
