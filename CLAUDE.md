# CLAUDE.md — JD FOODS OS

> **DRAFT (2026-11-25).** The build prompts (docs/PROMPTS.md) say this file is the source of truth, but no CLAUDE.md came with them. Claude drafted this one to match the sections the prompts refer to (§7.5–§7.8, §10). If you have an original CLAUDE.md, replace this file with it and tell Claude to reconcile.

## 1. What we are building

JD FOODS OS is one integrated platform (ERP + CRM + HRIS + LMS + e-commerce + BI) for **JD Foods**, a Philippine food manufacturer and distributor (brands: ThyChef, Arkadia, JD Foods). It replaces spreadsheets and disconnected tools with a single database, so every number on the CEO dashboard can be traced back to a source record.

**Key business facts (2026-11-26, see docs/OPEN_QUESTIONS.md → Answered):** one company and one TIN distribute all brands; the system is **not** BIR-registered, so it issues billing invoices and **monitors official sales invoice numbers** issued from the current source; lots and expiry are tracked; customers can order a single pack (no MOQ); about 20% of sales are on credit; one Shopify store with one location; about 12 sales reps (6 office, 6 field, GPS check-in); delivery by **third-party couriers only**, booked manually from two pickup locations, shipping paid by the client (about 20 a day, no own fleet); official sales invoices come from pre-printed booklets; price lists: retail, regular, corporate, distributor, reseller + customer-specific prices; Shopify Advanced; the CEO approves most transactions, the operations manager approves petty cash.

This repository started as the **JD Foods Sales Academy** (training, quizzes, AI roleplay for the sales team). The Academy is kept and becomes the *Training/Academy* module (docs/MODULES.md #16). Everything else is built around it, phase by phase, following docs/PROMPTS.md.

## 2. Users and language

- Users are mostly non-technical staff in the Philippines, many on phones. Use plain English labels, short sentences, and no jargon. The AI roleplay uses Taglish where configured.
- Timezone is **Asia/Manila** for every business date, cut-off, schedule and report. Store timestamps as `timestamptz` (UTC); convert at the edges.
- Currency is **PHP (₱)**. Quantities and money never use floating point (§6).

## 3. Stack

- **Next.js 15 (App Router) + React 19 + TypeScript strict**, Tailwind v4, shadcn-style UI primitives (`src/components/ui`), lucide icons, Zod for validation.
- **Supabase**: Postgres 15, Auth, Storage, Realtime, pg_cron. Project region: Singapore.
- **Vercel** hosting. **Resend** for email. **PayMongo** for online payments. **Shopify Admin API (GraphQL)** for jdfoods.ph. **Anthropic Claude API** server-side only.
- Tests: **Vitest** (unit + DB tests on PGlite running the real migrations, no Docker needed), **Playwright** for E2E (added in Phase 1). CI on GitHub Actions.

## 4. Repository layout

```
src/app/(app)/<module>/...     signed-in staff area, one folder per module
src/app/portal/...             external portals (Phase 7)
src/app/api/...                route handlers (webhooks, exports, streaming)
src/components/ui              primitives; src/components/<shared> reusable blocks
src/lib/<module>/              domain logic: pure functions (unit-tested) + service.ts (DB)
supabase/migrations/           one-way, timestamped SQL migrations
supabase/tests/                RLS + DB rule tests
docs/                          MODULES, DECISIONS, OPEN_QUESTIONS, CHANGELOG, COMPANY_FACTS, plans/, specs/, user-guides/
```

## 5. Core principles

1. **One database, one source of truth.** No module keeps its own copy of another module's master data (products, customers, employees, suppliers).
2. **Security in the database.** Every table has RLS. Business rules that matter (no negative stock, no self-approval, balanced journals, locked periods, QA-only release) are enforced in Postgres (constraints, triggers, security-definer functions), never only in the UI.
3. **Least privilege.** Permissions are granted through roles scoped to entity/location/department. Restricted data classes (salaries, formulas, bank details, 201 files, government IDs) need explicit permissions and every read is logged.
4. **Everything is audited.** Generic audit trigger on every business table; append-only.
5. **Immutable ledgers.** Stock movements and journal entries are never edited or deleted; corrections are reversals.
6. **Config over code.** Tax rates, statutory tables, approval limits, thresholds, escalation timings and numbering formats live in tables, effective-dated where they can change, editable by admins.
7. **Placeholders are labelled.** Any value we don't know (tax, statutory, company facts) is stored with `needs_verification = true` and listed in docs/OPEN_QUESTIONS.md. Never present a guess as fact.
8. **Events connect modules.** A module emits a domain event to the outbox; other modules (posting engine, notifications, Shopify sync) consume it. Modules don't reach into each other's tables to trigger side effects.
9. **Every number drills down** to a filtered list and then to the source record.
10. **Mobile-first for field, warehouse, driver and portal screens**; desktop-dense for back office.
11. **Import before you type.** Every master-data module ships a CSV/Excel import template on the shared import framework.
12. **AI proposes, humans approve.** AI output is a draft or suggestion. No AI path can post, approve, pay or change stock.

## 6. Coding conventions

- Money: `numeric(18,2)` in SQL, integer centavos or a decimal library in TS. Unit costs `numeric(18,6)`. Quantities `numeric(18,4)`. Never JS `number` arithmetic on money; never `float`.
- IDs: `uuid` primary keys; human document numbers come from the numbering service.
- Every business table has `id, entity_id (where relevant), created_at, created_by, updated_at, updated_by`, an audit trigger and RLS policies.
- Soft states via `status` enums; archive instead of delete for master data.
- Server Actions / route handlers validate input with Zod, then call `src/lib/<module>/service.ts`. Multi-row writes that must be atomic go into a Postgres function (RPC).
- The service-role key is used server-side only, for things RLS can't express (account creation, webhook ingestion, cron jobs), and those paths re-check permissions in code.
- Pure business logic (pricing, costing, FEFO, payroll, posting rules, scoring) lives in pure functions with unit tests.
- Indexes on every foreign key and every column used in list filters. No N+1 queries in list pages.
- Errors: user-facing messages in plain English; log details server-side. No silent catches.
- Never edit an applied migration; add a new one.

## 7. Shared engines (built in Phase 1, reused everywhere)

### 7.1 Organization
Entities → locations (`type`, `holds_inventory`) → departments → positions → employees. `user ↔ employee` link. `supervisor_id` drives escalations.

### 7.2 RBAC + RLS
`permissions` catalog (`module.action`, e.g. `inventory.adjust.approve`), `roles`, `role_permissions`, `user_roles(user_id, role_id, entity_id?, location_id?, department_id?)`. SQL helpers: `has_permission(perm, entity?, location?)`, `current_employee_id()`, `in_scope(...)`. RLS policies call these helpers. Auditor role = read-only on everything except restricted classes.

### 7.3 Audit log
Generic trigger writes `table, record_id, action, old, new, changed_by, changed_at`. Every record page has a History tab.

### 7.4 Document numbering, attachments, outbox
- `next_document_number(entity, doc_type, date)` with per-year sequences and an optional gapless mode (row lock).
- Attachments: private buckets, signed URLs, polymorphic `attachments(record_table, record_id, ...)`.
- `domain_events` outbox (`type, payload, status, attempts, last_error`) + dispatcher with retry and a dead-letter view.

### 7.5 Approval engine
- `approval_policies(doc_type, entity, conditions, min_amount, max_amount)` → ordered `approval_policy_steps(step_no, approver_rule)`; approver rules: specific role, requester's supervisor, department head, or named user.
- Submitting a document creates an `approval_request` with steps resolved at submission time. Actions: approve, reject, return for changes (with comment). Steps run in order; any rejection ends the request.
- **No self-approval** (enforced in the DB function). **Delegation**: a user can delegate approvals for a date range to another user with equal or higher authority; delegated actions record both people.
- The source document can't move past "submitted" until the request is approved (status guarded by a DB trigger).
- Approval inbox (desktop + mobile), counts in the top bar, email + in-app notifications at each step, overdue steps feed §7.6.
- Active seed policies (owner-confirmed 2026-11-26): **petty cash → operations manager up to ₱50,000**, above that CEO; **everything else → CEO**.
- The tiered template (≤ ₱5,000 department head; ₱5,001–25,000 operations manager; ₱25,001–100,000 finance head + executive; > ₱100,000 CEO) is seeded **inactive** for when department heads are added.

### 7.6 Notification & escalation engine
- `notification_rules(event_type, audience rule, channels, template)`, user `notification_preferences`, `notifications` (in-app via Realtime), email via Resend.
- Escalation ladder for overdue items (configurable): owner → **+24h** supervisor → **+48h** CEO / executive dashboard risk feed. (A department-head step at +48h, pushing the executive step to +72h, can be switched on later.)
- pg_cron job every 15 minutes evaluates overdue items (approvals, follow-ups, tickets, tasks) and escalates idempotently.

### 7.7 Stock ledger
- `stock_movements` is append-only: `product, location, bin, batch, qty (signed, base UoM), unit_cost, movement_type, source_doc, posted_at`. Updates and deletes are blocked by trigger.
- `stock_balances(product, location, bin, batch)` is maintained in the same transaction by a posting function, never written directly.
- **Negative stock is blocked.** Only `released` batches can be reserved, picked, dispatched or transferred to sellable locations (DB-level check).
- Costing: moving weighted average per product per entity; each movement stores its unit cost.

### 7.8 Posting engine (accounting)
- Domain events (invoice issued, dispatch, GRN, supplier invoice, collection, payment, adjustment, sample, settlement, landed cost, depreciation, payroll) map to `posting_rules` that produce balanced journal entries with dimensions (department, location, channel, product line, project).
- Journal entries must balance (DB constraint), are immutable once posted (reversal only), and are rejected for locked periods.
- Failures go to an "unposted events" queue. Every rule has a unit test.

## 8. Testing

- Unit tests for all pure logic; DB tests (PGlite, real migrations) for every RLS policy and DB-enforced rule; Playwright E2E for each phase's main flow.
- Each seed role gets an RLS test proving what it can and can't see/do.
- `npm run typecheck && npm test` must pass before any commit. CI must be green before a phase is called done.
- pg_cron, Realtime and Storage aren't available in PGlite: test the SQL functions they call directly; cover the wiring in E2E against Supabase.

## 9. Data and environments

- Demo/seed data is clearly marked (`is_demo = true`) so the go-live purge removes it.
- Local `.env.local` (never committed); `.env.example` lists every variable. Secrets only server-side; nothing secret gets a `NEXT_PUBLIC_` prefix.
- Data Privacy Act (RA 10173): collect only what is needed, record consent where required, restricted classes, access logs.

## 10. Working rules for Claude

1. **Plan first.** At the start of each phase, write `docs/plans/phase-NN.md` (scope, data model, screens, rules, tests, risks, open questions) and the specs named in the prompt. Wait for approval before writing code if the plan raises questions that change the design.
2. Work in small, reviewable steps; keep the app runnable after each step.
3. Never edit old migrations. Never weaken RLS to make something work.
4. Ask before adding a paid service, a new third-party dependency of significance, or anything that sends data outside Supabase/Vercel/Resend/Anthropic/Shopify/PayMongo.
5. When a business fact is unknown, use a labelled placeholder and add it to docs/OPEN_QUESTIONS.md instead of guessing.
6. Record design choices in docs/DECISIONS.md (date, decision, why, alternatives).
7. Update docs/MODULES.md and docs/CHANGELOG.md at the end of each step.
8. End each phase with: acceptance criteria checked one by one, test results, a demo script (click-by-click), and known gaps.
9. Commit only when asked. Don't push or deploy without being asked.

## 11. Existing Academy code (carried over)

- Roles today are a simple enum (`owner`, `manager`, `rep`) on `profiles`. Phase 1 migrates them to the RBAC model (§7.2): owner → Super administrator, manager → Sales head / team manager scope, rep → Sales representative. Academy RLS helpers (`is_owner`, `manages_user`, …) are re-implemented on top of `has_permission` so existing policies keep working.
- `teams` / `branches` map onto departments / locations.
- The Academy's placeholder `products` table becomes a view on (or FK to) the Phase 2 product master.
- `field_kpis` (manually entered by managers) is replaced by real CRM data from Phase 3 where available.
- `notifications`, `audit_log` and `ai_usage` are generalised in Phase 1 rather than duplicated.
