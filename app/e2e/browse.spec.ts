import { test, expect } from "@playwright/test";
import { loginViaCookie } from "./auth-cookie";

// Runs in both desktop and mobile-chrome projects. Browse is gated, so every test
// (except the last) starts authenticated via a sealed session cookie.
test.beforeEach(async ({ context }) => {
  await loginViaCookie(context);
});

test("lists course folders at the browse root", async ({ page }) => {
  await page.goto("/vault/browse");
  await expect(page.getByRole("link", { name: /Course A/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Course B/ })).toBeVisible();
});

test("navigates into a folder and back via breadcrumbs", async ({ page }) => {
  await page.goto("/vault/browse");
  await page.getByRole("link", { name: /Course A/ }).click();
  await expect(page).toHaveURL(/\/vault\/browse\/Course%20A$/);

  // Nested folder and a file are shown, folders first. Anchor the file name so
  // the "Open" link is matched, not the separate "Download <name>" button.
  await expect(page.getByRole("link", { name: /Week 1/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^intro\.txt/ })).toBeVisible();

  // The "Browse" breadcrumb links back to the root.
  await page.getByRole("link", { name: "Browse", exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/browse$/);
});

test("filters the listing client-side", async ({ page }) => {
  await page.goto("/vault/browse/Course%20A");
  await page.getByLabel("Filter this folder").fill("slides");
  await expect(page.getByRole("link", { name: /^slides\.pptx/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^intro\.txt/ })).toHaveCount(0);
});

test("serves a file with the right content-type, inline by default", async ({ page }) => {
  const res = await page.request.get("/vault/api/files/Course%20A/intro.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  expect(res.headers()["content-disposition"]).toContain("inline");
  expect(await res.text()).toContain("intro text");
});

test("?download=1 forces an attachment for an otherwise-inline file", async ({ page }) => {
  const res = await page.request.get("/vault/api/files/Course%20A/intro.txt?download=1");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
});

test("the gate still blocks browse without a session", async ({ browser }) => {
  const fresh = await browser.newContext(); // no cookie
  try {
    const page = await fresh.newPage();
    await page.goto("/vault/browse");
    await expect(page).toHaveURL(/\/vault\/login$/);
  } finally {
    await fresh.close();
  }
});
