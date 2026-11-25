"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { register, type RegisterState } from "./actions";

export function RegisterForm({ initialType }: { initialType: "customer" | "distributor" | "supplier" }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(register, {});
  if (state.done) {
    return (
      <Alert tone="success">
        Thanks! We received your request{state.email ? ` for ${state.email}` : ""}. If email confirmation is on, check your inbox first. We&apos;ll let
        you know when your account is approved.
      </Alert>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <Field label="I am a" htmlFor="account_type">
        <Select id="account_type" name="account_type" defaultValue={initialType}>
          <option value="customer">Customer (restaurant, café, reseller, business)</option>
          <option value="distributor">Distributor</option>
          <option value="supplier">Supplier</option>
        </Select>
      </Field>
      <Field label="Business name" htmlFor="company_name">
        <Input id="company_name" name="company_name" required maxLength={160} autoComplete="organization" />
      </Field>
      <Field label="Your full name" htmlFor="full_name">
        <Input id="full_name" name="full_name" required maxLength={120} autoComplete="name" />
      </Field>
      <Field label="Mobile number" htmlFor="phone">
        <Input id="phone" name="phone" required inputMode="tel" maxLength={40} autoComplete="tel" placeholder="09XX XXX XXXX" />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label="Anything we should know? (optional)" htmlFor="note">
        <Textarea id="note" name="note" rows={3} maxLength={1000} placeholder="e.g. your location, products you're interested in, who referred you" />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" required className="mt-1 size-4" />
        <span>I agree that JD Foods may use these details to review my request and contact me, in line with the Data Privacy Act.</span>
      </label>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Request account"}</Button>
    </form>
  );
}
