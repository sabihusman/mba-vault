import { test, expect } from "@playwright/test";

// Runs in both the desktop and mobile-chrome projects (see playwright.config.ts).

test("home page shows the MBA-Vault heading", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "MBA-Vault" }),
  ).toBeVisible();
});

test("has no horizontal overflow (responsive)", async ({ page }) => {
  await page.goto("/");
  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("exposes the service worker API (PWA)", async ({ page }) => {
  await page.goto("/");
  const supported = await page.evaluate(() => "serviceWorker" in navigator);
  expect(supported).toBe(true);
});
