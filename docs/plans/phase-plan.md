# JD FOODS OS — phase plan (proposed)

Based on the 12 phases in docs/PROMPTS.md, adjusted because we're growing the existing Sales Academy instead of starting from an empty folder. Phases 1–6 are still the MVP.

| Phase | Scope | Change from PROMPTS.md |
|---|---|---|
| 0 | **Close out the Academy work in progress**: finish/commit the uncommitted dashboard + streak + single-current-score changes; freeze Academy features. | **New.** Don't start re-platforming with half-finished work in the tree. |
| 1a | **Foundation — platform**: org model (one entity, locations, departments, positions, employees; entity switcher hidden while there's one), RBAC + RLS helpers, migrate Academy roles onto RBAC, auth upgrades (MFA for staff, login history, new-device alert, session timeout, external self-registration with approval), generic audit + History tab, app shell (permission-driven sidebar, entity/location switcher, command palette, settings), Playwright + GitHub Actions CI, Vercel preview, PWA manifest. | **Split.** Original Phase 1 is too big for one review cycle. |
| 1b | **Foundation — engines**: numbering, attachments, outbox + dispatcher, approval engine + inbox, notification & escalation engine (Realtime, Resend, pg_cron), reusable components (DataTable, RecordPage, KpiCard, MoneyInput, QtyWithUoM, Scanner…), CSV import framework. | **Split.** Academy's own email notifications (old Academy Phase 5) are delivered by this engine instead of separately. |
| 2 | Products, inventory, warehouse | Unchanged. The Academy's placeholder `products` table is replaced by the product master (lessons and roleplay scenarios keep working). |
| 3a | **Sales & CRM**: customers + 360 page, leads/pipeline, activities and field visits, pricing, quotations, targets, rep dashboard, commissions rules. | **Split.** |
| 3b | **Orders & channels**: sales order lifecycle, credit check, fulfilment, **courier delivery** (booking record, tracking number, fee, POD from courier/customer), **billing invoices + official sales invoice monitoring** (SI series register, missing/duplicate/out-of-range/gap alerts), opening AR import, Shopify (single location), marketplace CSV imports, live selling, automations. | **Split.** No driver app (courier-only). SI monitoring added (not BIR-registered). |
| 4 | Procurement & suppliers | Unchanged. Decision point before starting: custom vs Odoo/ERPNext for Phases 4–5. |
| 5 | Accounting, finance & treasury | Unchanged. Needs accountant engaged before it starts, not at the end. |
| 6 | CEO Command Center, dashboards, scheduled reports — **MVP complete** | Adds a **Training dashboard** (Academy skill scores, at-risk reps, certification) next to the Sales dashboard, and links rep training scores to actual sales results. |
| 7 | Client, distributor & supplier portals + Business Growth Center | Unchanged. |
| 8 | Manufacturing, QA, R&D, FDA | Unchanged. |
| 9 | HRIS, attendance, payroll | Unchanged. Onboarding checklists auto-assign Academy learning paths (already possible since the Academy exists). |
| 10 | Logistics (courier) + customer service | **Smaller.** Fleet, vehicles, trip sheets, route optimisation and the driver app are dropped (no own fleet). Keeps courier adapters (API connectors for the couriers you use most), delivery cost and profitability, customer notifications, on-time KPI, and all of customer service. |
| 11a–d | Marketing/creatives; Academy expansion (customer/distributor/public courses with PayMongo, certificates, competency matrix); contracts/SOPs; projects/OKRs/assets/announcements | 11b is smaller because the Academy core already exists. |
| 12 | AI layer | Unchanged. Reuses the Academy's Claude client, prompt versioning and `ai_usage` cost tracking. |

## Effect of the kickoff answers (2026-11-26)

- One company/TIN → no inter-company logic, simpler numbering and VAT.
- Not BIR-registered → billing invoices plus official SI monitoring in 3b.
- Lots/expiry/bins tracked today → batch required on every movement from Phase 2; opening stock import must include batch, expiry and bin.
- No MOQ, single packs → pack is the default selling unit; MOQ optional.
- ~20% credit with holds today → credit check stays in 3b; opening AR import moves into 3b (needed for the credit check before Phase 5).
- Couriers only → no driver app in 3b, much smaller Phase 10.
- CEO approves most things → short approval chains in 1b; tiered limits seeded inactive.

## Why these adjustments

1. **Phase 0 first.** There are 12 uncommitted files of Academy work. Re-platforming roles and auth on top of them would make both changes hard to review or roll back.
2. **Split 1 and 3.** Each original phase is several weeks of work with 10+ acceptance items. Smaller phases mean you click through a working demo more often and catch wrong assumptions early.
3. **Academy roles migrate in 1a.** Today's `owner/manager/rep` enum is baked into RLS. Moving it onto the RBAC model once, early, avoids two permission systems.
4. **Field KPIs become real data.** The Academy's manually entered field KPIs get replaced by CRM activity and sales data in 3a/3b, so training effectiveness can be measured against actual revenue (Phase 6).
5. **Accountant early.** Phase 5 is the highest risk; engaging the accountant during Phase 3 (chart of accounts, VAT, invoice requirements) avoids rework.

## Not changing

- Order of business phases (inventory → sales → procurement → accounting → dashboards).
- Rule: don't start a phase until the previous one's acceptance criteria pass and you've clicked through the demo.
