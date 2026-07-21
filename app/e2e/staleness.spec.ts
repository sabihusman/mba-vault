import { test, expect, type Page } from "@playwright/test";
import { loginViaCookie } from "./auth-cookie";

test.beforeEach(async ({ context }) => {
  await loginViaCookie(context);
});

/** Open the "Staleness check" accordion row if it isn't already expanded (the
 *  panel auto-expands any non-ok row, and "never run" is amber/non-ok — but
 *  asserting on that incidental default would make this test fragile to any
 *  future change in what the e2e fixture env's staleness status defaults to). */
async function openStalenessRow(page: Page) {
  const row = page.getByRole("button", { name: /Staleness check/ });
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
}

test("staleness renders as a 6th accordion row, showing never-run status when expanded", async ({ page }) => {
  await page.goto("/vault/browse");
  await page.getByRole("button", { name: /System health/ }).click();

  const row = page.getByRole("button", { name: /Staleness check/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Never run");

  await openStalenessRow(page);
  await expect(page.getByRole("button", { name: "Run now" })).toBeEnabled();
});

test("clicking Run now (from inside the row) surfaces the not-configured state when GEMINI_API_KEY is unset", async ({
  page,
}) => {
  // The e2e environment has no GEMINI_API_KEY (only browse/login/resume need
  // fixtures) — so the real POST route's own hasApiKey() check is what
  // produces this response. Exercises the actual click -> fetch -> status
  // branch -> render path end to end, not just the unit-tested pieces.
  await page.goto("/vault/browse");
  await page.getByRole("button", { name: /System health/ }).click();
  await openStalenessRow(page);

  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText("Not configured (missing GEMINI_API_KEY).")).toBeVisible();
});

test.describe("cron secret auth path (no session cookie at all)", () => {
  // Real HTTP calls via Playwright's request fixture — deliberately NOT using
  // loginViaCookie, since the whole point is proving the systemd timer's own
  // auth mechanism (gate.ts's hasValidCronSecret) works without a session.
  // GEMINI_API_KEY is unset in this env, so a request that gets PAST the gate
  // still ends up 503 (not configured) rather than 202 — that 503-vs-401
  // distinction is exactly what proves the gate let it through or didn't.
  //
  // A distinct synthetic x-real-ip per case: without nginx in front of the dev
  // server, clientIp() falls back to "unknown" for every direct call, which is
  // the SAME bucket the browser-click test above uses — with the desktop +
  // mobile projects both running every test, that's enough traffic to trip
  // the endpoint's own 2/hour rate limit and make tests interfere with each
  // other. Only the "valid secret" case actually reaches the rate limiter
  // (the other two 401 at the gate, before trigger.ts ever runs) — it still
  // gets its own IP for a stable, unshared bucket.

  test("a valid cron secret gets past the gate (non-401) with no cookie", async ({ request }) => {
    const res = await request.post("/vault/api/staleness/run", {
      headers: { "x-cron-secret": process.env.E2E_CRON_SECRET as string, "x-real-ip": "203.0.113.10" },
    });
    expect(res.status()).not.toBe(401);
  });

  test("a missing cron secret is rejected with a real 401", async ({ request }) => {
    const res = await request.post("/vault/api/staleness/run", {
      headers: { "x-real-ip": "203.0.113.11" },
    });
    expect(res.status()).toBe(401);
  });

  test("a wrong cron secret is rejected with a real 401", async ({ request }) => {
    const res = await request.post("/vault/api/staleness/run", {
      headers: { "x-cron-secret": "not-the-right-secret", "x-real-ip": "203.0.113.12" },
    });
    expect(res.status()).toBe(401);
  });
});
