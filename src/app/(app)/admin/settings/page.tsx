import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { getSettings, requireOwner } from "@/lib/auth";
import { savePrivacy, saveBranding, saveScoring } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireOwner();
  const s = await getSettings();
  if (!s) return <p>Settings row missing — run the seed script.</p>;

  return (
    <>
      <PageHeader title="Settings" description="Changes are recorded in the audit log." />
      <div className="grid gap-4 lg:grid-cols-2">
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

        <Card>
          <CardTitle>Scoring &amp; limits</CardTitle>
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
                <Input id="daily_roleplay_limit" name="daily_roleplay_limit" type="number" min={0} defaultValue={s.daily_roleplay_limit} />
              </Field>
              <Field label="Monthly AI budget (USD)" htmlFor="monthly_ai_budget_usd" hint="Empty = no hard stop.">
                <Input id="monthly_ai_budget_usd" name="monthly_ai_budget_usd" type="number" min={0} step="0.01" defaultValue={s.monthly_ai_budget_usd ?? ""} />
              </Field>
              <Field label="At-risk: inactive days" htmlFor="at_risk_inactive_days">
                <Input id="at_risk_inactive_days" name="at_risk_inactive_days" type="number" min={1} defaultValue={s.at_risk_inactive_days} />
              </Field>
              <Field label="At-risk: failed attempts" htmlFor="at_risk_failed_attempts">
                <Input id="at_risk_failed_attempts" name="at_risk_failed_attempts" type="number" min={1} defaultValue={s.at_risk_failed_attempts} />
              </Field>
              <Field label="Onboarding target (days)" htmlFor="onboarding_target_days" hint="Expected days to Field Ready.">
                <Input id="onboarding_target_days" name="onboarding_target_days" type="number" min={1} defaultValue={s.onboarding_target_days} />
              </Field>
            </div>
          </ActionForm>
        </Card>

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
                <Input id="data_retention_years" name="data_retention_years" type="number" min={1} defaultValue={s.data_retention_years} />
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
