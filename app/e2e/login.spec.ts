import { test, expect } from "@playwright/test";

// Runs in both the desktop and mobile-chrome projects (see playwright.config.ts).
// Covers the proxy gate + the login page. The authenticated flows (successful
// login, wrong code, lockout) land in PR5.

test("gate redirects an unauthenticated visitor to the login page", async ({ page }) => {
  await page.goto("/vault");
  await expect(page).toHaveURL(/\/vault\/login$/);
});

test("login page renders the heading and all three credential fields", async ({ page }) => {
  await page.goto("/vault/login");
  await expect(page.getByRole("heading", { level: 1, name: "MBA-Vault" })).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
});

test("login page has no horizontal overflow (responsive)", async ({ page }) => {
  await page.goto("/vault/login");
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("exposes the service worker API (PWA)", async ({ page }) => {
  await page.goto("/vault/login");
  const supported = await page.evaluate(() => "serviceWorker" in navigator);
  expect(supported).toBe(true);
});
