/**
 * Phase 1a acceptance flow against a real Supabase project (use a TEST project: this creates and deletes users).
 * admin signs in → sets up two-step sign-in → adds a staff user with a role → that user signs in, sets up two-step
 * sign-in, accepts the privacy notice, sees only their pages → the audit log shows the role grant.
 */
import { expect, test, type Page } from "@playwright/test";
import { adminClient, hasSupabase, randomPassword, totp } from "./helpers";

test.skip(!hasSupabase(), "Needs a Supabase test project (see e2e/README.md)");
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const admin = { email: `e2e-admin-${stamp}@example.com`, password: randomPassword(), id: "" };
const rep = { email: `e2e-rep-${stamp}@example.com`, password: randomPassword(), id: "" };

test.beforeAll(async () => {
  const sb = adminClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: admin.email,
    password: admin.password,
    email_confirm: true,
    app_metadata: { roles: ["super_admin"], full_name: "E2E Admin" },
  });
  if (error) throw error;
  admin.id = data.user.id;
  // skip the privacy notice for the admin
  await sb.from("profiles").update({ consent_version: "v1", consent_at: new Date().toISOString() }).eq("id", admin.id);
  const { data: s } = await sb.from("app_settings").select("consent_version").single();
  if (s) await sb.from("profiles").update({ consent_version: s.consent_version }).eq("id", admin.id);
});

test.afterAll(async () => {
  const sb = adminClient();
  for (const id of [rep.id, admin.id].filter(Boolean)) await sb.auth.admin.deleteUser(id);
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** First sign-in: enrol the authenticator using the text key, then enter a code. */
async function enrolMfa(page: Page) {
  await expect(page).toHaveURL(/\/mfa/);
  await page.getByText("Can't scan? Enter this key instead").click();
  const secret = (await page.locator("p.font-mono").innerText()).trim();
  await page.getByLabel(/6-digit code/i).fill(totp(secret));
  await page.getByRole("button", { name: /finish setup/i }).click();
  return secret;
}

test("admin sets up two-step sign-in and adds a staff user", async ({ page }) => {
  await signIn(page, admin.email, admin.password);
  await enrolMfa(page);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/admin/users/new");
  await page.getByLabel("Full name").fill("E2E Rep");
  await page.getByLabel("Work email").fill(rep.email);
  await page.getByLabel(/Sales representative/).check();
  await page.getByLabel(/Temporary password/).check();
  await page.getByLabel("Temporary password", { exact: true }).fill(rep.password);
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText(/User created/)).toBeVisible();
  rep.id = page.url().split("/admin/users/")[1].split("?")[0];
  await expect(page.getByText("Sales representative").first()).toBeVisible();
});

test("the new user signs in with two-step sign-in and only sees their pages", async ({ page }) => {
  await signIn(page, rep.email, rep.password);
  await enrolMfa(page);
  await expect(page).toHaveURL(/\/consent/);
  await page.getByRole("button", { name: /accept|agree/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  await expect(nav.getByRole("link", { name: "Learn" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/error=forbidden/);
});

test("the audit log shows the role grant", async ({ page }) => {
  const sb = adminClient();
  const { data: factors } = await sb.auth.admin.mfa.listFactors({ userId: admin.id });
  expect(factors?.factors.length).toBe(1);
  // sign in again; the authenticator is already set up, so we need the stored secret → re-enrol instead
  await sb.auth.admin.mfa.deleteFactor({ userId: admin.id, id: factors!.factors[0].id });
  await signIn(page, admin.email, admin.password);
  await enrolMfa(page);
  await page.goto(`/admin/audit?entity=user_roles`);
  await expect(page.getByText(/granted Sales representative|created role/).first()).toBeVisible();
  const { data: events } = await sb.from("login_events").select("method, success").eq("user_id", rep.id);
  expect(events?.some((e) => e.method === "password" && e.success)).toBe(true);
  expect(events?.some((e) => e.method === "mfa" && e.success)).toBe(true);
});
