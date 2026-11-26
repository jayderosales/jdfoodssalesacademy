import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { can, getAccess, getSettings, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveBranding, saveCompany, savePrivacy, saveScoring, saveSecurity, saveShop } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission(["admin.settings.manage", "admin.security.manage", "academy.admin"]);
  const access = await getAccess();
  const s = await getSettings();
  if (!s) return <p>Settings row missing — run the seed script.</p>;
  const supabase = await createClient();
  const { data: entity } = await supabase
    .from("entities")
    .select("id, name, legal_name, tin, vat_registered, address")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const shop = s as unknown as { shop_enabled?: boolean; paymongo_enabled?: boolean; unpaid_order_hours?: number; shop_payment_instructions?: string };
  const canBrand = can(access, ["admin.settings.manage", "academy.admin"]);
  const isAcademyAdmin = can(access, "academy.admin");

  return (
    <>
      <PageHeader title="Settings" description="Changes are recorded in the audit log." />
      {can(access, ["admin.settings.manage", "admin.approvals.manage"]) && (
        <nav aria-label="More settings" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { href: "/admin/settings/approvals", label: "Approval policies", hint: "Who approves what, by amount" },
            { href: "/admin/settings/working-hours", label: "Working hours & holidays", hint: "Used by escalation clocks" },
            { href: "/admin/settings/notifications", label: "Notifications & escalation", hint: "Messages and the escalation ladder" },
            { href: "/admin/settings/numbering", label: "Document numbering", hint: "Prefixes and next numbers" },
            { href: "/admin/settings/events", label: "Background jobs", hint: "Follow-up work that failed" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg border bg-card p-3 text-sm hover:border-brand">
              <span className="block font-medium text-brand">{l.label}</span>
              <span className="text-xs text-muted-foreground">{l.hint}</span>
            </Link>
          ))}
        </nav>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {can(access, "admin.settings.manage") && (
          <Card>
            <CardTitle>Online shop</CardTitle>
            <ActionForm action={saveShop} submitLabel="Save shop settings">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shop_enabled" defaultChecked={shop.shop_enabled ?? true} /> Shop is open (customers can place orders)</label>
              <Field label="Payment instructions shown to customers" htmlFor="shop_payment_instructions" hint="Bank account, GCash and Maya numbers and account names. Customers see this on their order page.">
                <Textarea id="shop_payment_instructions" name="shop_payment_instructions" rows={5} defaultValue={shop.shop_payment_instructions ?? ""} required />
              </Field>
              <Field label="Cancel unpaid shop orders after (hours)" htmlFor="unpaid_order_hours"><Input id="unpaid_order_hours" name="unpaid_order_hours" type="number" min={1} max={720} defaultValue={shop.unpaid_order_hours ?? 48} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="paymongo_enabled" defaultChecked={shop.paymongo_enabled ?? false} /> Offer online payment (PayMongo). Needs the PayMongo keys set in Vercel.</label>
            </ActionForm>
          </Card>
        )}
        {can(access, "admin.settings.manage") && entity && (
          <Card>
            <CardTitle>Company profile</CardTitle>
            <ActionForm action={saveCompany} submitLabel="Save company profile">
              <input type="hidden" name="id" value={entity.id} />
              <Field label="Short name" htmlFor="ent_name">
                <Input id="ent_name" name="name" defaultValue={entity.name} required />
              </Field>
              <Field label="Registered (legal) name" htmlFor="legal_name">
                <Input id="legal_name" name="legal_name" defaultValue={entity.legal_name} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="TIN" htmlFor="tin">
                  <Input id="tin" name="tin" defaultValue={entity.tin} placeholder="000-000-000-000" />
                </Field>
                <Field label="VAT-registered?" htmlFor="vat_registered">
                  <Select
                    id="vat_registered"
                    name="vat_registered"
                    defaultValue={entity.vat_registered === null ? "" : entity.vat_registered ? "yes" : "no"}
                  >
                    <option value="">Not set</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </Select>
                </Field>
              </div>
              <Field label="Registered address" htmlFor="ent_address">
                <Input id="ent_address" name="address" defaultValue={entity.address} />
              </Field>
            </ActionForm>
          </Card>
        )}
        {can(access, "admin.security.manage") && (
          <Card>
            <CardTitle>Sign-in security</CardTitle>
            <ActionForm action={saveSecurity} submitLabel="Save security settings">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="require_mfa_internal" defaultChecked={s.require_mfa_internal} className="mt-1 size-4" />
                <span>
                  <strong>Require two-step sign-in for all staff</strong>
                  <span className="block text-xs text-muted-foreground">
                    Recommended. Turn off only briefly, e.g. while everyone installs an authenticator app.
                  </span>
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Staff: sign out after (minutes idle)" htmlFor="idle_int">
                  <Input
                    id="idle_int"
                    name="idle_timeout_internal_minutes"
                    type="number"
                    min={5}
                    max={1440}
                    defaultValue={s.idle_timeout_internal_minutes}
                  />
                </Field>
                <Field label="Portal users: sign out after (minutes idle)" htmlFor="idle_ext">
                  <Input
                    id="idle_ext"
                    name="idle_timeout_external_minutes"
                    type="number"
                    min={5}
                    max={43200}
                    defaultValue={s.idle_timeout_external_minutes}
                  />
                </Field>
              </div>
            </ActionForm>
          </Card>
        )}
        {canBrand && (
          <Card>
            <CardTitle>Branding</CardTitle>
            <ActionForm action={saveBranding} submitLabel="Save branding">
              <Field label="Company name" htmlFor="company_name">
                <Input id="company_name" name="company_name" defaultValue={s.company_name} required />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["brand_primary", "Primary (red)"],
                    ["brand_secondary", "Secondary (orange)"],
                    ["brand_accent", "Accent (yellow)"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label} htmlFor={key}>
                    <Input id={key} name={key} type="color" defaultValue={s[key]} className="h-12 p-1" />
                  </Field>
                ))}
              </div>
              <Field label="Logo" htmlFor="logo" hint="Square PNG, JPG or WebP, under 1 MB. Leave empty to keep the current logo.">
                <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
              </Field>
            </ActionForm>
          </Card>
        )}

        {isAcademyAdmin && (
          <Card>
            <CardTitle>Training: scoring &amp; limits</CardTitle>
            <ActionForm action={saveScoring} submitLabel="Save scoring & limits">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Skill score weights (must total 100)</legend>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Quizzes %" htmlFor="weight_quiz">
                    <Input id="weight_quiz" name="weight_quiz" type="number" min={0} max={100} defaultValue={s.weight_quiz} />
                  </Field>
                  <Field label="Roleplays %" htmlFor="weight_roleplay">
                    <Input id="weight_roleplay" name="weight_roleplay" type="number" min={0} max={100} defaultValue={s.weight_roleplay} />
                  </Field>
                  <Field label="Field KPIs %" htmlFor="weight_kpi">
                    <Input id="weight_kpi" name="weight_kpi" type="number" min={0} max={100} defaultValue={s.weight_kpi} />
                  </Field>
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Roleplays per rep per day" htmlFor="daily_roleplay_limit">
                  <Input
                    id="daily_roleplay_limit"
                    name="daily_roleplay_limit"
                    type="number"
                    min={0}
                    defaultValue={s.daily_roleplay_limit}
                  />
                </Field>
                <Field label="Monthly AI budget (USD)" htmlFor="monthly_ai_budget_usd" hint="Empty = no hard stop.">
                  <Input
                    id="monthly_ai_budget_usd"
                    name="monthly_ai_budget_usd"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={s.monthly_ai_budget_usd ?? ""}
                  />
                </Field>
                <Field label="At-risk: inactive days" htmlFor="at_risk_inactive_days">
                  <Input
                    id="at_risk_inactive_days"
                    name="at_risk_inactive_days"
                    type="number"
                    min={1}
                    defaultValue={s.at_risk_inactive_days}
                  />
                </Field>
                <Field label="At-risk: failed attempts" htmlFor="at_risk_failed_attempts">
                  <Input
                    id="at_risk_failed_attempts"
                    name="at_risk_failed_attempts"
                    type="number"
                    min={1}
                    defaultValue={s.at_risk_failed_attempts}
                  />
                </Field>
                <Field label="Onboarding target (days)" htmlFor="onboarding_target_days" hint="Expected days to Field Ready.">
                  <Input
                    id="onboarding_target_days"
                    name="onboarding_target_days"
                    type="number"
                    min={1}
                    defaultValue={s.onboarding_target_days}
                  />
                </Field>
              </div>
            </ActionForm>
          </Card>
        )}

        {(isAcademyAdmin || can(access, "admin.settings.manage")) && (
          <Card className="lg:col-span-2">
            <CardTitle>Data privacy</CardTitle>
            <ActionForm action={savePrivacy} submitLabel="Save privacy settings">
              <Field
                label="Employee data privacy notice"
                htmlFor="consent_text"
                hint="Shown on first sign-in. Use **bold** and _italic_. Blank line = new paragraph."
              >
                <Textarea id="consent_text" name="consent_text" defaultValue={s.consent_text} rows={14} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Notice version" htmlFor="consent_version" hint="Change it (e.g. v2) to make everyone accept again.">
                  <Input id="consent_version" name="consent_version" defaultValue={s.consent_version} />
                </Field>
                <Field label="Data protection officer contact" htmlFor="dpo_contact">
                  <Input id="dpo_contact" name="dpo_contact" defaultValue={s.dpo_contact} />
                </Field>
                <Field label="Keep ex-employee data (years)" htmlFor="data_retention_years">
                  <Input
                    id="data_retention_years"
                    name="data_retention_years"
                    type="number"
                    min={1}
                    defaultValue={s.data_retention_years}
                  />
                </Field>
              </div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
