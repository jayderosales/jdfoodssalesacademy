"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { actOnApproval, type FormState } from "../actions";

export function DecisionForm({ stepId, requestId }: { stepId: string; requestId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(actOnApproval, {});
  if (state.message) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="step_id" value={stepId} />
      <input type="hidden" name="request_id" value={requestId} />
      <Field label="Comment" htmlFor="comment" hint="Required when rejecting or returning.">
        <Textarea id="comment" name="comment" rows={3} maxLength={1000} />
      </Field>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="action" value="approve" disabled={pending}>Approve</Button>
        <Button type="submit" name="action" value="return" variant="outline" disabled={pending}>Return for changes</Button>
        <Button type="submit" name="action" value="reject" variant="danger" disabled={pending}>Reject</Button>
      </div>
    </form>
  );
}
