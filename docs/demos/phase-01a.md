# Phase 1a demo script (click-through)

Takes about 20 minutes. You need: your phone with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…), and a second email address you can receive mail on.

Start the app: `npm run dev`, open http://localhost:3000 (or the Vercel preview once it exists).

## 1. Two-step sign-in (you, as Super administrator)
1. Sign in with your email and password.
2. You land on **Two-step sign-in**. Scan the QR code with your authenticator app, type the 6-digit code, press **Finish setup**.
   - Expected: you reach the dashboard. Next time you sign in you only type the code.
3. Open **My account**: you see your roles (Super administrator, CEO), "Two-step sign-in: on", **Your devices** (this browser) and **Recent sign-ins** (password + mfa).

## 2. App shell
1. The sidebar now has sections: Home, **Training**, **Administration** and **Coming soon** (only you see Coming soon).
2. Press **Ctrl+K** (Cmd+K on Mac), type "loc" → **Locations** → Enter. Type a person's name → their user page.
3. The bell (top right) shows notifications; the avatar menu shows your roles and Sign out.
4. On your phone (or a narrow window) the bottom bar shows up to 5 items and always includes My account.

## 3. Organization
1. **Administration → Organization → Locations.** You see "Main Office" (the old Academy branch) and "Kamuning office". Add a location: code `WH-QC`, name "Quezon City warehouse", type Warehouse, tick **Holds inventory** and **Courier pickup point** → Add.
   - Try type **Office** with **Holds inventory** ticked → you get "An office can't hold inventory".
2. **Departments**: the 9 starter departments are placeholders. Rename or deactivate any that don't fit.
3. **Positions**: add "Sales Representative" (Sales) and "Operations Manager" (Operations).
4. **Employees**: add yourself (employee no. `0001`) and a second person with you as **Supervisor**. Then edit yourself and choose the second person as your supervisor → "This supervisor would create a loop".
5. **Sales teams**: "Sales Team A" now sits under a location instead of a branch.

## 4. Users and roles
1. **Users → Add staff user.** Enter the second email, tick **Operations manager**, choose **Temporary password**, enter one, **Create user**.
2. On their page: **Roles** shows Operations manager. **Add role** → Warehouse personnel, **Only at location** = Quezon City warehouse → Add role. It shows "Warehouse personnel (Quezon City warehouse)".
3. Link them to their **Employee record** under Details → Save.
4. Try changing **your own** roles → not offered ("You can't change your own roles").
5. **Roles & permissions** → open **Sales representative**: see its permissions. Open **CEO**: "This role has every permission".
6. Add a custom role "Branch cashier", tick "See the company directory" → Save permissions.

## 5. The new user's view
1. Open a private/incognito window. Sign in as the new user with the temporary password.
2. They must set up two-step sign-in, then accept the privacy notice.
3. Expected: their sidebar has **Home** only (no Training, no Administration). Visiting `/admin/users` sends them back with "You don't have access to that page."
4. Back in your window, on their user page: **Recent sign-ins** lists their password + mfa sign-ins.
5. Sign in again from a different browser (or after clearing cookies): they receive a **"New sign-in to JD Foods OS"** email. *(Needs RESEND_API_KEY; without it the app logs "email skipped".)*

## 6. Idle sign-out
1. **Settings → Sign-in security**: set "Staff: sign out after" to **5** minutes → Save.
2. Sign out and in again (the new limit applies from the next sign-in), then leave the tab alone. At 4 minutes a warning appears; at 5 you're signed out with "You were signed out because you weren't active for a while."
3. Set it back to 30.

## 7. Customer self-registration
1. Signed out, on the sign-in page click **Request an account**. Fill it in as a Customer with a third email → **Request account**.
2. As admin: **Users** shows "1 sign-up is waiting for approval". Open it: company, phone and note are shown. **Approve account**.
3. Sign in as that customer: no two-step sign-in needed; they land on the **Portal** placeholder ("Online ordering… will open here soon").

## 8. Audit trail
1. **Administration → Audit log**: filter by record type **role**: "granted Operations manager", "granted Warehouse personnel", each with who and when.
2. Filter **location** → your new warehouse, with the fields you set.
3. Open the new user's page and scroll to **History**: every change to them, field by field.
4. The log can't be edited: there are no edit/delete buttons, and the database refuses changes.

## 9. Lost phone
1. On the new user's page: **Reset two-step sign-in** → confirm. At their next sign-in they set up the authenticator again.

## What's not in 1a (comes in 1b)
Approval inbox and approval count, notification engine (real-time bell, mark as read, email rules, escalations), document numbering, attachments, the shared table/record components, and CSV import (for bulk employees, etc.).
