import { test, expect } from "@playwright/test";
import { loginViaCookie } from "./auth-cookie";

test.beforeEach(async ({ context }) => {
  await loginViaCookie(context);
});

test("staleness trigger shows never-run status inside the health panel", async ({ page }) => {
  await page.goto("/vault/browse");

  await page.getByRole("button", { name: /System health/ }).click();
  await expect(page.getByRole("heading", { name: "Staleness check", level: 3 })).toBeVisible();
  await expect(page.getByText("Never run yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run now" })).toBeEnabled();
});

test("clicking Run now surfaces the not-configured state when GEMINI_API_KEY is unset", async ({ page }) => {
  // The e2e environment has no GEMINI_API_KEY (only browse/login/resume need
  // fixtures) — so the real POST route's own hasApiKey() check is what
  // produces this response. Exercises the actual click -> fetch -> status
  // branch -> render path end to end, not just the unit-tested pieces.
  await page.goto("/vault/browse");
  await page.getByRole("button", { name: /System health/ }).click();

  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText("Not configured (missing GEMINI_API_KEY).")).toBeVisible();
});
