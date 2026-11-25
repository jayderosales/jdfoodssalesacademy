# Decisions

Format: date — decision — why — alternatives considered.

### 2026-11-25 — Grow the Sales Academy repo into JD FOODS OS
- **Decision:** build JD FOODS OS in this repository; the Academy becomes the Training/Academy module.
- **Why:** owner's choice. Same stack (Next.js + Supabase + Vercel), already has auth, RLS, audit triggers, AI usage logging and DB tests, and isn't deployed yet, so we can still refactor roles and schema freely.
- **Alternatives:** a new empty repository with the Academy migrated in later (cleaner start, but duplicates auth/users and needs a data migration).

### 2026-11-25 — Custom build, not Odoo/ERPNext
- **Decision:** custom build per docs/PROMPTS.md assumptions.
- **Why:** stated assumption; keeps one codebase with the Academy.
- **Alternatives:** Odoo/ERPNext for procurement + accounting (Phases 4–5 would become integrations). Revisit before Phase 4 if accounting scope or BIR CAS registration looks too heavy.

### 2026-11-25 — Single-tenant; 2026-11-26 — single legal entity
- **Decision:** one deployment for JD Foods only. One legal entity (one TIN) owns all brands; brand is a product attribute, not an entity. We keep a single `entities` row and an `entity_id` column on key tables (cheap now, avoids a painful migration if a second company is ever added), but the UI hides the entity switcher while there is only one.
- **Why:** owner confirmed one company, one TIN, no inter-company sales.

### 2026-11-26 — Billing invoices + official sales invoice monitoring
- **Decision:** JD FOODS OS will not be BIR-registered. It issues **billing invoices** (internal numbering) and tracks the **official sales invoice (SI) number** issued from the current BIR-registered source against each billing invoice. Registered SI series/booklets are recorded (series, range, location/person holding it); the system flags orders delivered without an SI number after N days, duplicate SI numbers, numbers outside a registered range, gaps and voided SIs, and shows a booklet usage report.
- **Why:** owner wants to monitor official invoice issuance without registering the system (CAS).
- **Alternatives:** BIR CAS / e-invoicing registration (revisit if the volume makes manual SI issuance painful).

### 2026-11-26 — Courier-only delivery
- **Decision:** no own-fleet features. Couriers are booked manually from two pickup locations and the client pays shipping. Delivery = courier booking record (courier, pickup location, booking/tracking number, shipping fee charged to the customer as a pass-through line), status updates, and proof of delivery uploaded from the courier (screenshot/photo) or confirmed by the customer. No driver role or driver app in Phase 3b; Phase 10 drops vehicles, trip sheets, route optimisation and fleet maintenance.
- **Why:** third-party couriers only, about 20 deliveries a day.

### 2026-11-26 — Approval chains centred on the CEO
- **Decision:** seed policies: petty cash → operations manager up to ₱50,000, above that → CEO; all other approvals (purchases, discounts above threshold, credit holds, adjustments, expenses, payments) → CEO. The tiered limits (₱5k / ₱25k / ₱100k) stay in the engine as editable, inactive templates for when department heads are added. Escalation ladder: owner → +24h supervisor → +48h CEO risk feed.
- **Why:** the CEO approves most transactions today; adding layers nobody fills would just slow things down.

### 2026-11-25 — Keep PGlite DB tests
- **Decision:** keep the existing in-memory Postgres (PGlite) test harness for RLS and DB rules; add Playwright against a Supabase project for E2E.
- **Why:** fast, no Docker on the developer's Windows machine. pg_cron/Realtime/Storage are covered in E2E instead.

### 2026-11-26 — Price lists
- **Decision:** seed price lists: retail (also Shopify), wholesale/regular, corporate, distributor, reseller (separate from distributor), plus customer-specific price overrides that win over the customer's list. Quantity breaks optional; MOQ default 1.
- **Why:** owner confirmed distributors and resellers have different arrangements and some customers have special prices.

### 2026-11-26 — Keep profiles.role as a read-only Academy cache (deviation from the 1a plan)
- **Decision:** instead of dropping `profiles.role`, keep it as a cache of the user's Academy level (owner/manager/rep/null), maintained by triggers from their roles' permissions. Direct writes are blocked. RLS never uses it; it uses `has_permission()`.
- **Why:** ~170 places in the Academy code filter or label by it (e.g. "list reps"). Keeping the column avoided a risky rewrite of working screens while still making RBAC the single source of truth.
- **Alternative:** a view or RPC for "academy level" and rewriting those queries; can be done gradually.

### 2026-11-26 — Organization menu vs directory access
- **Decision:** every staff role gets `org.view` (needed later to pick locations/departments in forms), but the Organization menu item only shows for people who maintain it or audit it (`admin.org.manage`, `employees.manage`, `admin.users.view`, `readonly.all`).

### 2026-11-26 — Prettier for new code only
- **Decision:** Prettier config added; the existing Academy files were not mass-reformatted (would bury real changes in a 100-file diff). CI runs lint, typecheck, tests and build, not a format check. A one-off formatting commit can be done any time.

### 2026-11-26 — MFA enforcement in the database
- **Decision:** `has_permission()` requires an `aal2` session for internal users, so a stolen password alone reads nothing. External portal users don't need MFA. A settings switch (`require_mfa_internal`) exists for rollout; it's audited.

### 2026-11-26 — Two-step sign-in switched off (owner's choice)
- **Decision:** `app_settings.require_mfa_internal` set to false on the live project. The feature stays in the code and can be switched back on in Settings → Sign-in security. New environments still start with it on.
- **Why:** owner asked to remove it.
- **Risk accepted:** a stolen staff password alone gives access. Revisit before Phase 5 (accounting) and Phase 9 (payroll) go live, or at least require it for admins.
