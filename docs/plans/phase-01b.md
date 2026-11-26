# Phase 1b — Foundation: shared engines

Status: **built** (2026-11-26). Answers used: working-hours escalation, in-app notifications now (email later), petty cash as the first document. Demo: docs/demos/phase-01b.md.
Covers PROMPTS.md Phase 1 items 6–10, 12 and 13: document numbering, attachments, domain-event outbox, approval engine, notification & escalation engine, reusable UI components, CSV/Excel import framework. Builds on Phase 1a (org model, RBAC, audit).

## 1. Goal

Every later module (inventory, sales, procurement, accounting…) needs the same plumbing: a document number, files attached to records, "send this for approval", "tell these people", "chase it if nobody acts", a good table and a bulk import. Build each once, here, and prove it end to end with one real document: **petty cash requests** (operations manager approves up to ₱50,000, CEO above).

## 2. Scope

### 2.1 Document numbering
- `number_series(entity, doc_type, prefix, year_reset, padding, gapless, next_value)`; seed `PCR` (petty cash request), `APR` (approval request). Format `PCR-2026-00001`.
- `next_document_number(doc_type, date)` (security definer). Normal mode uses a row lock per series per year; **gapless mode** allocates inside the caller's transaction so a rolled-back document doesn't burn a number (needed later for invoices, OR/SI tracking).
- Settings → Numbering: view series, change prefix/padding (not the counter backwards).

### 2.2 Attachments
- Private Storage bucket `attachments`; path `{table}/{record_id}/{uuid}-{filename}`. Max 20 MB; images, PDF, Office, CSV.
- `attachments(record_table, record_id, storage_path, filename, mime, size, uploaded_by, description)`; RLS: you can see/add attachments only on records you can see (per-table check function registry, so each module plugs in its own rule).
- `<Attachments table=… id=… />` component: drag-drop / phone camera, list with signed download links (5-minute expiry), delete own uploads (audited).

### 2.3 Domain events outbox
- `domain_events(type, aggregate_table, aggregate_id, payload, status, attempts, next_attempt_at, last_error)`; `emit_event()` SQL function used by triggers/RPCs in the same transaction as the business change.
- Dispatcher: a Postgres function run by **pg_cron every minute** handles in-database consumers (notifications, escalation bookkeeping); external work (email) is picked up by a **Supabase Edge Function** called through pg_net. Retries with back-off; after 8 failures → dead-letter, visible in an admin "Failed events" list with Retry.
- Why an Edge Function and not a Vercel route: the Vercel production domain has deployment protection, which blocks calls from the database; an Edge Function runs next to the database with no extra exposure. (Record in DECISIONS.)

### 2.4 Approval engine (CLAUDE.md §7.5)
- `approval_policies(doc_type, name, min_amount, max_amount, active, priority)` → `approval_policy_steps(step_no, approver_type: role|supervisor|department_head|user, role_id, user_id)`.
- `approval_requests(number, doc_type, record_table, record_id, amount, requested_by, status: pending|approved|rejected|returned|cancelled, current_step)` and `approval_steps(request_id, step_no, approver_ids[], status, acted_by, acted_on_behalf_of, acted_at, comment, due_at)`.
- `submit_for_approval(table, id, amount)` picks the matching policy, resolves approvers **at submission time**, emits events. `act_on_approval(step, action: approve|reject|return, comment)`:
  - **No self-approval** (DB check; requester is removed from approver lists, and a step with no remaining approver escalates to the next level).
  - Steps in order; reject ends; return sends back to requester for edits and resubmission.
  - Source document status is guarded by trigger: it can't be marked approved except by the engine.
- **Delegation**: `approval_delegations(from_user, to_user, starts, ends, reason)`; delegate must hold the same approval permission; actions record both people.
- **Approval inbox** (desktop + phone): "Waiting for me", "I submitted", "Delegated to me", history; approve/reject/return with comment; count badge in the top bar.
- **Seed policies** (owner-confirmed): petty cash ≤ ₱50,000 → Operations manager; > ₱50,000 → CEO. Tiered template (₱5k/₱25k/₱100k) seeded **inactive**. Settings → Approval policies to edit (audited).

### 2.5 Notification & escalation engine (CLAUDE.md §7.6)
- `notification_rules(event_type, audience, channels: in_app|email, template_title, template_body, active)`; `notification_preferences(user, event_type, in_app, email)` (some events can't be muted, e.g. approvals assigned to you).
- Notifications table (existing) gains `href`, `priority`; bell becomes **live (Supabase Realtime)** with mark-as-read / mark-all-read and a full Notifications page.
- Email through **Resend** from the Edge Function; plain, mobile-friendly template with a link back to the record. Without a Resend key, in-app only (logged).
- **Escalation ladder** (configurable, `escalation_rules`): owner → **+24h supervisor** → **+48h CEO / executive risk feed**. pg_cron every 15 minutes runs `escalate_overdue()`: idempotent (each level fires once per item), skips cancelled/finished items, walks `employees.supervisor_id`. Works for approval steps now and for follow-ups, tickets and tasks later via a small `escalatable_items` registry.
- **Executive risk feed**: `risk_alerts` table + a dashboard card for CEO/Super administrator listing escalated items (Phase 6 moves it into the Command Center).

### 2.6 Reusable components
- **DataTable**: server-side pagination, sort, filters, search, column chooser, **saved views** (per user, optionally shared), **Excel export** of the current filter (exceljs), mobile card layout.
- **RecordPage**: header (number, status, actions), tabs (Details / Attachments / Approvals / History).
- **KpiCard** (clickable to a filtered list), **StatusBadge**, **MoneyInput** (₱, centavo-safe), **QtyWithUoM**, **DateRangePicker** (Manila presets: today, this week, this month…), **Scanner** (phone camera barcode/QR using the browser's BarcodeDetector, with a library fallback for iPhones).
- Demo page `/admin/components` (Super administrator only) showing each one.

### 2.7 CSV / Excel import framework
- Steps: **upload** (CSV/XLSX) → **map columns** (auto-match by header, saved per template) → **validate** (Zod per row, with row-level errors and warnings) → **preview** (first 50 rows, totals) → **commit** (one transaction; all or nothing) → **result** (created/updated counts, downloadable error file).
- `import_jobs` table (who, when, file, template, counts, status) for audit; downloadable blank templates with an example row.
- First importers: **employees** (with supervisor by employee no.) and **locations**. Phase 2+ add products, opening stock, etc. on the same framework.

### 2.8 Petty cash request (reference document)
- `petty_cash_requests(number, requested_by, department, amount numeric(18,2), purpose, needed_on, status: draft|submitted|approved|rejected|returned|cancelled)` + attachments (receipts/quotes).
- Screens: list (DataTable), new/edit, record page with Approvals and History tabs. Approving only records the approval; the actual cash release and liquidation come with Phase 5 (finance).
- Permission `petty_cash.request` (all staff), approvals through the engine.

## 3. Out of scope
Cash release/liquidation and accounting entries (Phase 5); SMS/web push (later); escalation for modules that don't exist yet (they register when built).

## 4. Migrations (new files only)
1. `…_numbering.sql` 2. `…_attachments.sql` (+ bucket, storage policies) 3. `…_outbox.sql` (+ pg_cron, pg_net) 4. `…_approvals.sql` 5. `…_notifications_engine.sql` (+ escalation, risk feed) 6. `…_saved_views_imports.sql` 7. `…_petty_cash.sql`. Each new table: RLS + `enable_audit()`.

## 5. Tests
- Unit: number formatting, money math, column auto-mapping, row validation, escalation timing, template rendering.
- DB (PGlite): gapless numbering under rollback; no self-approval; step order; reject/return; delegation; policy selection by amount (₱50,000 → ops manager, ₱50,000.01 → CEO); source status guarded; escalation fires once per level and walks the supervisor chain; attachments RLS; import commit is all-or-nothing.
- E2E (Playwright, test Supabase project): staff submits petty cash request with a receipt → operations manager approves from the inbox → requester notified → audit log shows each step. Escalation: an overdue test step escalates to the supervisor after running the job with a moved clock.

## 6. Acceptance (from PROMPTS.md Phase 1)
- Submit a request → approver approves from the inbox → requester notified → audit shows every step (E2E).
- Escalation job demonstrably notifies the supervisor for an overdue item.
- CI green; Vercel deployment live; docs updated; demo script.

## 7. Risks
- **pg_cron/pg_net and Edge Functions don't run in PGlite tests.** The SQL functions they call are tested directly; the wiring is checked on the Supabase project.
- **Email deliverability**: needs the jdfoods.ph domain verified in Resend (DNS records), otherwise emails land in spam or aren't sent.
- **Clock-based escalation** depends on supervisors being filled in under Organization → Employees; items with no supervisor go straight to the CEO feed.

## 8. Questions before coding
- **Q1. Business hours.** Should the 24h/48h escalation clock count every hour (including nights, Sundays and holidays), or only working hours (e.g. Mon–Sat 8:00–17:00 Manila, skipping holidays)? Recommended: working hours, so a request sent Saturday afternoon doesn't escalate on Monday morning.
- **Q2. Email.** Do you want email notifications in this phase? If yes, create a Resend account and verify jdfoods.ph (I'll give you the DNS records). If not yet, 1b ships in-app notifications only and email switches on later with no code change.
- **Q3. Petty cash as the first real document.** OK to use petty cash requests (approval only; cash release later) as the reference flow, or would you prefer another first document (e.g. purchase request, expense reimbursement)?

## 9. Rough size
About 3 working sessions. Order: numbering + attachments → outbox + notifications (in-app, Realtime) → approval engine + inbox + petty cash → escalation + risk feed → components → import framework → email → E2E + demo script.
