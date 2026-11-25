"use client";

import { useActionState } from "react";
import { Alert, Button } from "@/components/ui";

export type ActionResult = { error?: string; message?: string };

/**
 * Wraps a server action with pending state and an error / success message.
 * Children are the form fields; the submit button is rendered for you.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "space-y-4",
  variant,
  confirm,
}: {
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children?: React.ReactNode;
  className?: string;
  variant?: "default" | "danger" | "outline" | "secondary";
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
