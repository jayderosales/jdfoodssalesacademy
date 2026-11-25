/** Turning audit_log rows into plain-English lines for the History panel and the audit search. */

export interface AuditEntry {
  id: number;
  at: string;
  actor_id: string | null;
  action: "insert" | "update" | "delete" | string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: Record<string, [unknown, unknown]> | null;
  is_restricted: boolean;
}

export const ENTITY_LABEL: Record<string, string> = {
  profiles: "user",
  user_roles: "role",
  roles: "role definition",
  role_permissions: "role permission",
  permissions: "permission",
  entities: "company",
  locations: "location",
  departments: "department",
  positions: "position",
  employees: "employee",
  teams: "team",
  team_managers: "team manager",
  app_settings: "settings",
  signup_links: "sign-up link",
  learning_paths: "learning path",
  modules: "module",
  lessons: "lesson",
  lesson_assets: "lesson file",
  products: "product",
  quizzes: "quiz",
  questions: "question",
  scenarios: "roleplay scenario",
  rubrics: "rubric",
  levels: "level",
  badges: "badge",
  kpi_targets: "KPI target",
  field_kpis: "field KPI",
  level_signoffs: "level sign-off",
  roleplay_scores: "roleplay score",
  path_assignments: "path assignment",
  prehire_invites: "pre-hire invite",
};

/** Fields never shown in change lists (internal or noisy). */
const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at", "created_by", "updated_by", "token"]);
/** Fields whose values are long blobs: show "changed" instead of the value. */
const BLOB_FIELDS = new Set(["content", "consent_text", "persona", "criteria", "body", "requirements", "correct", "options", "scores"]);

export function fieldLabel(field: string): string {
  return field.replace(/_id$/, "").replace(/_/g, " ");
}

export function formatValue(field: string, v: unknown): string {
  if (BLOB_FIELDS.has(field)) return "(text)";
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

export interface DescribedEntry {
  summary: string;
  changes: { field: string; label: string; from: string; to: string }[];
}

export function describeAuditEntry(e: AuditEntry, lookups: { roleName?: (id: string) => string | undefined } = {}): DescribedEntry {
  const what = ENTITY_LABEL[e.entity] ?? e.entity.replace(/_/g, " ");
  const row = e.after ?? e.before ?? {};
  const name = (row.name ?? row.title ?? row.full_name ?? row.code ?? "") as string;

  if (e.entity === "user_roles") {
    const role = lookups.roleName?.(row.role_id as string) ?? "a role";
    if (e.action === "insert") return { summary: `granted ${role}`, changes: [] };
    if (e.action === "delete") return { summary: `removed ${role}`, changes: [] };
  }

  const verb = e.action === "insert" ? "created" : e.action === "delete" ? "deleted" : "changed";
  const summary = `${verb} ${what}${name ? ` “${name}”` : ""}`;
  if (e.action !== "update" || !e.diff) return { summary, changes: [] };

  const changes = Object.entries(e.diff)
    .filter(([f]) => !HIDDEN_FIELDS.has(f))
    .map(([f, [from, to]]) => ({ field: f, label: fieldLabel(f), from: formatValue(f, from), to: formatValue(f, to) }));
  return { summary, changes };
}
