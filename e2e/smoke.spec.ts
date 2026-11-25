import { expect, test } from "@playwright/test";

test("sign-in page loads @mobile", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
});

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
