# Phase 1b demo script

You need three staff accounts in different browsers: you (CEO), a test user with **Sales representative**, and one with **Operations manager**.

1. **Petty cash request.** As the sales rep: menu → **Petty cash** → **New request** → ₱1,500, "Fuel for deliveries" → **Send for approval**. On the request page, add a photo of a receipt under **Attachments**.
2. **Approver inbox.** As the operations manager: the ✓ icon in the top bar shows **1**, and the bell shows "Approval needed…" within seconds. Open **Approvals → Waiting for me** → the request → try **Reject** with no comment (it asks for one) → **Return for changes** with "Attach the official receipt".
3. **Return and resubmit.** As the rep: the bell says it was returned. Open it, change the amount, **Resubmit**. As the ops manager: **Approve**. The rep is notified; the request shows **Approved**, and the **Approvals** tab lists every step with names and times.
4. **CEO routing.** As the rep, request ₱60,000 → it goes to the CEO, not the ops manager.
5. **No self-approval.** As the ops manager, request ₱900 yourself → it goes to the CEO; you can't approve your own.
6. **Delegation.** As the ops manager: Approvals → **Away? Delegate your approvals** → pick a colleague for today. New requests also notify them, and their decision shows "X for Ops manager".
7. **Escalation.** Settings → **Notifications & escalation** shows the ladder (24 / 48 working hours). Settings → **Working hours & holidays**: confirm the holidays marked "check date". To see escalation without waiting, an admin can run `select public.escalate_overdue(now() + interval '7 days')` in the Supabase SQL editor; the supervisor and then the CEO get "Overdue" notifications, and the CEO's dashboard shows **Escalated to you**.
8. **Tables.** Petty cash list: search, filter by status, pick a date range, sort by amount, open **Columns** to show Department, **Saved views → Save current view**, then **Excel** to download exactly what's on screen.
9. **Import.** Administration → **Import data** → Employees → **Download a blank template**, fill in 3 people (one with a bad date, one with a supervisor number) → upload → check the column matches → see the row error → fix the file → import → "3 added". Check Organization → Employees and the Audit log.
10. **Numbering & jobs.** Settings → **Document numbering** shows the next PCR/APR numbers; **Background jobs** should say everything is up to date.

Not in 1b: email delivery (needs Resend), cash release/liquidation (Phase 5).
