# Open questions

Answer inline under each question (or in chat). Answered questions move to the bottom with the answer and date.

## Still open

1. **Two pickup locations.** Couriers pick up from two places. Do both hold stock (so we track inventory at each and transfer between them), or is one just a hand-over point? Names and addresses?
2. **Booklets in use at once.** How many official sales invoice booklets are in use at the same time, and who holds them (one per location, per person, or one for the whole company)?

## Other open items (not blocking Phase 1)

- **Supabase Auth settings to turn on** (dashboard → Authentication): leaked-password protection (advisor warning); session inactivity timeout / time-box (Pro plan). TOTP MFA is on by default.
- **Test Supabase project for E2E.** `e2e/phase-1a.spec.ts` creates and deletes users, so it should run against a separate test project, not the live one. Create one (free tier is fine) and add its keys as GitHub secrets, or tell me to skip it.
- **Resend** isn't configured yet, so new-device emails are skipped (logged) until RESEND_API_KEY and EMAIL_FROM are set.

- Paste or save the original build prompts as `docs/PROMPTS.md` so future sessions can refer to them.
- If an original CLAUDE.md exists, provide it (the current one is a draft).
- All tax rates, statutory tables, BIR forms and the chart of accounts need accountant sign-off before Phase 5 / 9 go-live.
- Privacy notice text (Data Privacy Act) and DPO contact — still a placeholder from the Academy.

## Answered

**2026-11-26 — follow-ups**

1. **Shopify plan:** Advanced.
2. **Petty cash:** the operations manager approves up to **₱50,000**; above that goes to the CEO.
3. **Supabase data:** all test data; it can be reset. → Phase 1a can reshape the Academy schema and roles freely; no data migration needed.
4. **Official sales invoices:** pre-printed **booklets**. → SI series register tracks booklets (series, number range, holder, status).
5. **Couriers:** booked **manually**, picked up from **two locations**; the **client pays shipping**. → No courier API in 3b; shipping fee is a pass-through charge on the order/invoice, not a company expense.
6. **Pricing:** distributors and resellers have **different** pricing arrangements; **some customers have special prices**. → Separate distributor and reseller price lists plus customer-specific price overrides.

**2026-11-26 — kickoff questions**

1. **Legal entities:** one company distributes all brands (JD Foods, ThyChef, Arkadia) under **one TIN**. No inter-company. → DECISIONS: single entity.
2. **BIR:** the system will **not** be BIR-registered. It must **monitor issuance of official sales invoices** from the current source. → DECISIONS: billing invoice + official invoice tracking.
3. **Batch/expiry and bins:** yes, tracked today. → Batch required on every stock movement from day one; bin-level stock.
4. **UoM / MOQ:** no minimum order quantity; customers can order a single pack. → MOQ stays optional (default 1); pack is the main selling unit, cases are a conversion.
5. **Credit:** about 20% of sales is on credit, and orders are held today for over-limit/overdue customers. → Credit check step kept in Phase 3b; opening AR import needed in Phase 3b.
6. **Shopify:** one store, **one location**, stock updated by hand, same SKUs as wholesale. Separate pricing for regular customers, corporate accounts, distributors and resellers. → Single-location inventory push; JD FOODS OS is the product master; Shopify keeps its own retail price.
7. **Sales team:** about 6 in the office and 6 in the field; GPS check-in wanted. → Mobile field-visit screens with GPS + photo; privacy notice must mention location capture.
8. **Delivery:** no own fleet; third-party couriers only, about 20 deliveries a day. → Phase 3b delivery = courier booking + tracking number + proof of delivery from the courier; no driver app. Phase 10 fleet features dropped.
9. **Approvers:** the CEO approves most transactions; the operations manager approves petty cash. → Approval seeds: petty cash → operations manager; everything else → CEO. Escalation ladder shortened.
10. **Supabase:** reuse the existing Supabase project.
