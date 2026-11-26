export type UserRole = "owner" | "manager" | "rep";
export type UserStatus = "active" | "inactive";
export type AccountType = "staff" | "customer" | "distributor" | "supplier";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  /** Academy access level, derived from the user's roles (read-only cache; null = no Academy access). Use permissions for security. */
  role: UserRole | null;
  employee_id: string | null;
  account_type: AccountType;
  company_name: string;
  phone: string;
  registration_note: string;
  approved_at: string | null;
  team_id: string | null;
  hire_date: string | null;
  status: UserStatus;
  exit_date: string | null;
  exit_reason: string | null;
  exit_stage_level: number | null;
  consent_version: string | null;
  consent_at: string | null;
  last_active_at: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  location_id: string | null;
  department_id: string | null;
}

export interface AppSettings {
  company_name: string;
  brand_primary: string;
  brand_secondary: string;
  brand_accent: string;
  logo_path: string | null;
  weight_quiz: number;
  weight_roleplay: number;
  weight_kpi: number;
  daily_roleplay_limit: number;
  monthly_ai_budget_usd: number | null;
  at_risk_inactive_days: number;
  at_risk_failed_attempts: number;
  onboarding_target_days: number;
  consent_version: string;
  consent_text: string;
  dpo_contact: string;
  data_retention_years: number;
  require_mfa_internal: boolean;
  idle_timeout_internal_minutes: number;
  idle_timeout_external_minutes: number;
  email_enabled: boolean;
  work_days: number[];
  work_start: string;
  work_end: string;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  owner: "Owner / Admin",
  manager: "Sales Manager",
  rep: "Salesperson",
};
