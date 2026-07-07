import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loginViaCookie } from "./auth-cookie";

// STATE_DIR is set by playwright.config and shared with this runner, so we can seed
// the same history file the app reads for the resume card. We only seed (never
// delete mid-run) to avoid races between parallel workers/projects sharing the
// path; the empty-history case is covered by the store unit tests.
const STATE_DIR = process.env.STATE_DIR as string;
const HISTORY = join(STATE_DIR, "history.jsonl");

const SEED = [
  { id: "a", question: "What is customer acquisition cost?", askedAt: "2026-07-05T09:00:00.000Z" },
  { id: "b", question: "How does LTV relate to CAC?", askedAt: "2026-07-06T09:00:00.000Z" },
];

test.beforeEach(async ({ context }) => {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(HISTORY, SEED.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  await loginViaCookie(context);
});

test("resume card shows the latest question and links into Ask", async ({ page }) => {
  await page.goto("/vault/browse");

  const card = page.getByRole("region", { name: "Pick up where you left off" });
  await expect(card).toBeVisible();

  // Newest-first: the headline is the most recent question, linking into /ask?q=…
  const latest = card.getByRole("link", { name: /How does LTV relate to CAC\?/ });
  await expect(latest).toBeVisible();
  await expect(latest).toHaveAttribute("href", /\/vault\/ask\?q=/);

  await latest.click();
  await expect(page).toHaveURL(/\/vault\/ask\?q=How%20does%20LTV/);
});
