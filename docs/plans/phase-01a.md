# Phase 1a — Foundation: platform

Status: **draft plan, waiting for approval** (2026-11-26).
Covers PROMPTS.md Phase 1 items 1–5 and 11 (scaffold/CI/PWA, auth, organization, RBAC + RLS, audit, app shell). Items 6–10, 12 and 13 (numbering, attachments, outbox, approvals, notifications/escalation, reusable components, CSV import) are Phase 1b.

## 1. Goal

Turn the Academy's three-role app (`owner / manager / rep`) into the JD FOODS OS platform: an organization model, a permission system that every future module plugs into, stronger sign-in, a full audit trail and an app shell that shows each person only what they're allowed to use. The Academy must keep working the whole way through.

## 2. Starting point (what exists)

- Next.js 15 + Supabase, email/password + magic link, invite-only staff accounts, team sign-up links with approval.
- `profiles.role` enum (`owner, manager, rep`), `branches`, `teams`, `team_managers`.
- ~70 RLS policies built on helpers `app_role, is_owner, is_staff, is_active_user, manages_user, can_view_user, can_manage_user, manages_team`.
- Audit triggers on users, teams, settings and content (`audit_log`), admin audit page.
- 111 passing tests incl. 33 RLS tests on PGlite. No Playwright, no CI, not deployed.
- Supabase data is test-only and may be reset (owner, 2026-11-26).

## 3. Scope

### 3.1 Scaffold, CI, deployment
- ESLint + Prettier config (none today), `npm run lint`, `format`.
- Playwright with a `e2e/` folder, run against `npm run build && npm start` with a Supabase project.
- GitHub Actions: install → lint → typecheck → unit + DB tests → build. E2E job runs on `main` and on PRs labelled `e2e` (needs Supabase secrets).
- Vercel project (region sin1), preview deployments per PR.
- PWA: web manifest, icons, a minimal service worker (offline page + static asset cache only; the offline queue comes in Phase 2).
- Supabase CLI migrations remain the only way schema changes.

### 3.2 Organization model
New tables (all with RLS, audit trigger, `created_by/updated_by`):
- `entities` — one row: JD Foods (name, TIN, VAT status, address, logo). Entity switcher hidden while there's one.
- `locations` — `type` (`office, plant, warehouse, pickup_hub, business_center`), `holds_inventory`, address, `is_pickup_point`. Seed: Kamuning office + placeholders for the two pickup locations (see OPEN_QUESTIONS #1).
- `departments` — name, code, `head_employee_id`, parent (optional).
- `positions` — title, department, default role(s) (used later for onboarding).
- `employees` — basic profile only: employee no., name, work email, phone, position, department, location, `supervisor_id` (self-FK), hire date, status. (Full 201 file is Phase 9.)
- `profiles.employee_id` — the user ↔ employee link. External users (customers, distributors, suppliers) have no employee.
- Academy mapping: `branches` → `locations`, `teams` → kept as **sales teams** (a grouping under the Sales department) because the Academy's reports and manager scopes use them. `team_managers` stays.

### 3.3 RBAC + RLS
- `permissions(code, module, description, is_restricted)` — catalog, seeded from code (`src/lib/rbac/permissions.ts` is the single list; a test checks DB = code).
- `roles(code, name, description, is_internal, is_system)` and `role_permissions`.
- `user_roles(user_id, role_id, location_id null, department_id null, team_id null, valid_from, valid_to, granted_by)` — a role can be scoped (e.g. Sales head for one team, Warehouse personnel for one location).
- SQL helpers (security definer, stable): `has_permission(code)`, `has_permission_at(code, location_id)`, `has_permission_for_team(code, team_id)`, `current_employee_id()`, `is_internal_user()`, `mfa_ok()`.
- **MFA enforced in the database:** for internal users `has_permission` returns false unless the session is `aal2` (`auth.jwt()->>'aal'`). An internal user without MFA can only reach the MFA enrolment page. Existing Academy rep role: MFA required too (staff) — see question Q1.
- Seed roles (PROMPTS.md list): Super administrator, CEO, CFO/Finance head, COO, CMO, Sales head, HR head, Accounting officer, Sales representative, Warehouse personnel, Manufacturing personnel, QA personnel, Creative personnel, Trainer, Employee, Driver (seeded but unused: courier-only), Customer, Distributor, Supplier, Auditor. Plus **Operations manager** (needed for petty cash approvals).
- Auditor: read permission on every non-restricted module, no write permissions, explicit deny on restricted classes.
- **Academy migration:** `owner` → Super administrator + CEO; `manager` → Sales head scoped to their teams (+ Trainer); `rep` → Sales representative. The old helpers (`is_owner`, `is_staff`, `manages_user`, …) are rewritten on top of `has_permission` so all ~70 existing policies keep working unchanged; then `profiles.role` is dropped in a later migration in this phase once nothing reads it. Academy permissions: `academy.learn`, `academy.content.manage`, `academy.review`, `academy.reports.view`, `academy.team.manage`, `academy.signup_links.manage`, etc.
- Admin UI: Users (list, invite, assign roles with scope, deactivate), Roles (create/edit role, tick permissions grouped by module), Permission matrix (read-only overview), "View as" preview of what a role can see (read-only, no impersonation).

### 3.4 Auth
- **Staff:** invite-only (existing). Invite email → set password → enrol TOTP MFA → sign in.
- **External (customer, distributor, supplier):** self-register page per type → account status `pending` → admin approves and links to a customer/distributor/supplier record (those records come in Phases 3/4/7; in 1a approval just assigns the role) → welcome email. Builds on the Academy's sign-up-link approval flow.
- Email + password, magic link (existing), password reset (existing via Supabase), **TOTP MFA** enrol/verify/remove (Supabase MFA API), recovery: admin can reset a user's MFA factor (audited).
- **Login history:** `login_events(user_id, at, ip, user_agent, device_id, method, success)` written by the sign-in server actions and auth callback. Failed attempts recorded too.
- **New-device alert:** device = hashed cookie id + user agent family; first sign-in from a new device emails the user ("Was this you?"). Uses a minimal Resend mailer in 1a; moved onto the notification engine in 1b.
- **Session timeout:** idle timeout in the app (default 30 min internal, 7 days external, configurable) with a warning before sign-out. Supabase "inactivity timeout / time-box" settings also set (needs Supabase Pro).
- Deactivated users blocked (existing behaviour kept).

### 3.5 Audit
- Generic `audit_trigger()` attached by a helper `select audit.enable('table')`; every new table in every phase calls it in its migration (a DB test fails if a public table has no audit trigger, with an explicit allow-list for logs).
- `audit_log` gains `record_table, record_id, action, old, new, diff, actor_id, actor_role, at, request_id`. Existing Academy audit rows are reset with the test data.
- History tab component for record pages (shows who changed what, field by field).
- Admin audit search: by table, record, user, date range, action; restricted-class rows only visible with permission.
- Reads of restricted classes are logged via a `log_restricted_access()` function (used from Phase 5/8/9).

### 3.6 App shell
- Sidebar built from a module registry (`src/lib/modules.ts`: module, route, icon, required permission); only permitted modules show. Mobile bottom bar keeps the Academy's 5-item pattern, chosen per role.
- Top bar: location switcher (entity switcher appears only when there's more than one entity), notification bell (reads the existing `notifications` table; Realtime + engine in 1b), approval count (placeholder until 1b), user menu.
- Command palette (Ctrl/Cmd+K): navigate to permitted pages, search users/employees (more record types added per phase).
- Settings area: company profile (entity), branding (existing), locations, departments & positions, users & roles, security (session timeouts, MFA policy), Academy settings (existing). Numbering, approval policies and notification rules pages arrive in 1b.
- Placeholder "coming soon" pages for modules in MODULES.md, visible only to Super administrator.

## 4. Out of scope (later)
Numbering, attachments, outbox, approval engine, notification/escalation engine, DataTable and other shared components, CSV import (all 1b). Employee 201 files (Phase 9). Linking external users to customer/supplier records (Phases 3/4/7).

## 5. Migrations (new files only)
1. `…_org_model.sql` — entities, locations, departments, positions, employees, `profiles.employee_id`, branches → locations data move.
2. `…_rbac.sql` — permissions, roles, role_permissions, user_roles, helpers, seed roles + permissions, migrate profile roles to user_roles.
3. `…_rls_on_rbac.sql` — re-define old helpers on top of `has_permission`; RLS for new tables.
4. `…_auth_security.sql` — login_events, devices, external registration status, security settings.
5. `…_audit_v2.sql` — generic audit trigger, attach to all tables, restricted access log.
6. `…_drop_profile_role.sql` — after code no longer reads `profiles.role`.

## 6. Tests
- **RLS matrix test:** for each seed role, a table of expected read/write per table (generated from the permission catalog), asserted on PGlite. Existing 33 Academy RLS tests keep passing unchanged.
- MFA: internal user at `aal1` gets no data; at `aal2` gets their permitted data; external user doesn't need MFA.
- Scoped roles: Sales head for team A can't see team B; Warehouse personnel for location X can't see location Y data (once inventory tables exist; tested now with employees).
- Auditor: reads everything non-restricted, writes nothing.
- Every public table has RLS enabled and an audit trigger (catalog test).
- Unit tests: permission catalog ↔ DB sync, module registry filtering, idle-timeout logic, device fingerprinting.
- **E2E (Playwright):** admin invites user → user accepts → sets password → enrols MFA → signs in → sees only permitted modules → admin changes a role → audit log shows each step. External: customer self-registers → pending → admin approves → customer signs in without MFA and sees only the portal placeholder.

## 7. Acceptance criteria
- All seed roles exist; RLS matrix tests prove each can only see and do what it should.
- Academy works exactly as before for the migrated owner/manager/rep users (existing tests + a short manual smoke test).
- Internal users can't read data without MFA (DB-level test).
- Login history and new-device email work; idle timeout signs users out.
- Audit log records every change with field-level diffs; History tab shows it.
- CI green on GitHub; Vercel preview live.
- Docs updated (MODULES, CHANGELOG, DECISIONS), demo script provided.

## 8. Risks
- **Rewriting the RLS helpers** under 70 existing policies. Mitigation: keep helper names and signatures, run the existing 33 RLS tests at every step, add the matrix test before changing anything.
- **MFA in RLS** depends on the JWT `aal` claim; magic-link sign-ins are `aal1` and must step up. E2E covers it.
- **Supabase Pro** is needed for session time-box/inactivity settings and production backups (about US$25/month). The app-level idle timeout works without it.
- PGlite has no `auth` schema by default; the test harness already stubs `auth.uid()` and will be extended to stub `auth.jwt()`.

## 9. Questions before coding
- **Q1.** Should sales reps (and other non-office staff) also be forced to use MFA (an authenticator app on their phone), or only people with access to money, HR or admin? Recommended: everyone internal, since reps will see customer data and prices from Phase 3.
- **Q2.** Who are the first users to set up for real: CEO, operations manager, sales head? (Names/emails can go in COMPANY_FACTS §4; not needed to start building.)
- **Q3.** Is "Kamuning office" one of the two courier pickup locations? (OPEN_QUESTIONS #1.)

## 10. Rough size
About 2–3 working sessions of build time, then your click-through. Order of work: CI/lint/Playwright → org model → RBAC + matrix tests → move Academy onto RBAC → MFA/auth → audit v2 → app shell → E2E → demo script.
