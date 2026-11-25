"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { createUser } from "../actions";

export function NewUserForm({ teams }: { teams: { id: string; label: string }[] }) {
  const [method, setMethod] = useState<"invite" | "password">("invite");
  return (
    <ActionForm action={createUser} submitLabel={method === "invite" ? "Create and send invite" : "Create user"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" name="full_name" required />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input id="email" name="email" type="email" required inputMode="email" />
        </Field>
        <Field label="Role" htmlFor="role">
          <Select id="role" name="role" defaultValue="rep">
            <option value="rep">Salesperson</option>
            <option value="manager">Sales Manager</option>
            <option value="owner">Owner / Admin</option>
          </Select>
        </Field>
        <Field label="Team" htmlFor="team_id" hint="Managers: choose the teams they manage on the next screen.">
          <Select id="team_id" name="team_id" defaultValue="">
            <option value="">— None —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Hire date" htmlFor="hire_date">
          <Input id="hire_date" name="hire_date" type="date" />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">How will they sign in?</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="method" value="invite" checked={method === "invite"} onChange={() => setMethod("invite")} className="mt-1" />
          <span><strong>Email invite</strong> — they get a link to set their own password.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="method" value="password" checked={method === "password"} onChange={() => setMethod("password")} className="mt-1" />
          <span><strong>Temporary password</strong> — you share it with them; they can change it under “Me”.</span>
        </label>
      </fieldset>

      {method === "password" && (
        <Field label="Temporary password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" name="password" type="text" minLength={8} required autoComplete="off" />
        </Field>
      )}
    </ActionForm>
  );
}
