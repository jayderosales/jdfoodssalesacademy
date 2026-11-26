"use client";

import { useActionState } from "react";
import { MoneyInput } from "@/components/shared/inputs";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createPettyCash, updatePettyCash, type FormState } from "./actions";

export interface PettyCashFormValues {
  id?: string;
  amount?: string;
  purpose?: string;
  needed_on?: string | null;
  department_id?: string | null;
}

export function PettyCashForm({ values, departments }: { values?: PettyCashFormValues; departments: { id: string; name: string }[] }) {
  const editing = !!values?.id;
  const [state, action, pending] = useActionState<FormState, FormData>(editing ? updatePettyCash : createPettyCash, {});
  return (
    <form action={action} className="space-y-4">
      {editing && <input type="hidden" name="id" value={values!.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" htmlFor="amount">
          <MoneyInput id="amount" name="amount" defaultValue={values?.amount} required />
        </Field>
        <Field label="Needed on (optional)" htmlFor="needed_on">
          <Input id="needed_on" name="needed_on" type="date" defaultValue={values?.needed_on ?? ""} />
        </Field>
      </div>
      <Field label="What is it for?" htmlFor="purpose">
        <Textarea id="purpose" name="purpose" rows={3} required maxLength={500} defaultValue={values?.purpose} placeholder="e.g. Fuel for Saturday deliveries to Cubao and Marikina" />
      </Field>
      <Field label="Department (optional)" htmlFor="department_id">
        <Select id="department_id" name="department_id" defaultValue={values?.department_id ?? ""}>
          <option value="">— Not specified —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </Field>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
        ) : (
          <>
            <Button type="submit" name="submit_now" value="1" disabled={pending}>{pending ? "Sending…" : "Send for approval"}</Button>
            <Button type="submit" variant="outline" disabled={pending}>Save as draft</Button>
          </>
        )}
      </div>
      {!editing && <p className="text-xs text-muted-foreground">You can attach receipts or quotes on the next screen.</p>}
    </form>
  );
}
