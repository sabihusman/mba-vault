import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { loginViaCookie } from "./auth-cookie";

// Phase 6 report page. Reports are seeded straight into the shared STATE_DIR
// (like resume.spec.ts seeds history.jsonl) — deterministic content, written
// idempotently in beforeEach so desktop + mobile projects can run in parallel.
// run-status.json is deliberately NOT written: the health-panel spec asserts
// its "Never run" default, and this page reads report files, not run status.
//
// No empty-state e2e: it would require deleting the reports dir, racing the
// seeded tests across projects on the shared STATE_DIR. The empty state is a
// trivial conditional in page.tsx; the selection logic behind it is unit-tested
// (report-format.test.ts).

const STATE_DIR = process.env.STATE_DIR as string;
const REPORTS_DIR = join(STATE_DIR, "staleness", "reports");

const OLD_RUN_ID = "2026-01-02T03-04-05-678Z";
const NEW_RUN_ID = "2026-07-18T14-30-05-123Z";

const NEW_REPORT = {
  runId: NEW_RUN_ID,
  startedAt: "2026-07-18T14:30:05.123Z",
  finishedAt: "2026-07-18T14:41:00.000Z",
  status: "partial",
  stopReason: "per-run cost cap ($1) reached",
  findings: [
    {
      conceptId: "strategy--five-forces",
      name: "Porter's Five Forces",
      course: "Strategy",
      verdict: "stale",
      modelVerdict: "stale",
      downgradeReason: null,
      courseworkSummary: "Coursework presents the classic five-force model.",
      currentSummary: "Recent sources add digital-platform dynamics as a sixth consideration.",
      evidenceLinks: [{ title: "Example source", uri: "https://example.com/five-forces" }],
      confidenceNote: "Two independent grounded sources agree.",
      escalated: false,
      checkedAt: "2026-07-18T14:32:00.000Z",
    },
    {
      conceptId: "finance--capm",
      name: "CAPM",
      course: "Finance",
      verdict: "couldnt_verify",
      modelVerdict: "current",
      downgradeReason: "ungrounded",
      courseworkSummary: "Coursework derives expected return from beta.",
      currentSummary: "Model asserted currency without citing any search result.",
      evidenceLinks: [],
      confidenceNote: "Downgraded: zero grounding sources returned.",
      escalated: false,
      checkedAt: "2026-07-18T14:35:00.000Z",
    },
    {
      conceptId: "marketing--4ps",
      name: "The 4 Ps",
      course: "Marketing",
      verdict: "couldnt_verify",
      modelVerdict: "couldnt_verify",
      downgradeReason: null,
      courseworkSummary: "Product, price, place, promotion.",
      currentSummary: "No usable current sources found.",
      evidenceLinks: [],
      confidenceNote: "Nothing usable found; not guessing.",
      escalated: false,
      checkedAt: "2026-07-18T14:38:00.000Z",
    },
  ],
  skipped: [
    { conceptId: "ops--lean", name: "Lean operations", reason: "run stopped early: cost cap reached" },
  ],
  summary: {
    conceptsTotal: 4,
    conceptsChecked: 3,
    flagged: 1,
    ungroundedDowngrades: 1,
    steps: 3,
    estimatedCostUsd: 1.02,
    consecutiveErrors: 0,
  },
};

const OLD_REPORT = {
  ...NEW_REPORT,
  runId: OLD_RUN_ID,
  startedAt: "2026-01-02T03:04:05.678Z",
  finishedAt: "2026-01-02T03:10:00.000Z",
  status: "ok",
  stopReason: null,
  skipped: [],
};

test.beforeEach(async ({ context }) => {
  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(join(REPORTS_DIR, `${NEW_RUN_ID}.json`), JSON.stringify(NEW_REPORT), "utf8");
  await writeFile(join(REPORTS_DIR, `${OLD_RUN_ID}.json`), JSON.stringify(OLD_REPORT), "utf8");
  await loginViaCookie(context);
});

test("the Report tab is reachable from the main nav and shows the latest run", async ({ page }) => {
  await page.goto("/vault/browse");
  // Mobile: bottom tab bar; desktop: header tabs — either way there's exactly
  // one visible nav link named "Report".
  await page.getByRole("link", { name: "Report" }).click();
  await expect(page).toHaveURL(/\/vault\/staleness$/);

  // Latest (partial) run's header, not the older ok run.
  await expect(page.getByText("Partial")).toBeVisible();
  await expect(page.getByText("per-run cost cap ($1) reached")).toBeVisible();
  await expect(page.getByText("3 / 4")).toBeVisible();
  await expect(page.getByText("$1.02")).toBeVisible();
});

test("findings are worst-first with distinct couldn't-verify badges", async ({ page }) => {
  await page.goto("/vault/staleness");

  // Spec item 4: the two couldn't-verify variants are distinguishable at a
  // glance, in the collapsed rows.
  await expect(page.getByText("Couldn’t verify — ungrounded (model gave no evidence)")).toBeVisible();
  await expect(page.getByText("Couldn’t verify — no external match")).toBeVisible();

  // Worst-first: the stale row renders before both couldn't-verify rows.
  const rows = page.getByRole("button", { name: /Porter's Five Forces|CAPM|The 4 Ps/ });
  await expect(rows.first()).toContainText("Porter's Five Forces");

  // Expansion reveals reasoning + grounding link + the downgrade explanation.
  await page.getByRole("button", { name: /CAPM/ }).click();
  await expect(page.getByText(/zero\s+grounding sources, so the verdict was reduced/)).toBeVisible();
  await page.getByRole("button", { name: /Porter's Five Forces/ }).click();
  await expect(page.getByRole("link", { name: "Example source" })).toBeVisible();

  // Skipped section.
  await expect(page.getByText("run stopped early: cost cap reached")).toBeVisible();
});

test("?run=<runId> shows an older report; a bogus run falls back to newest", async ({ page }) => {
  await page.goto(`/vault/staleness?run=${OLD_RUN_ID}`);
  await expect(page.getByText("OK", { exact: true })).toBeVisible();

  await page.goto("/vault/staleness?run=not-a-real-run");
  await expect(page.getByText("Partial")).toBeVisible();
});

test("the page is session-gated: no cookie → login redirect", async ({ browser }) => {
  const cleanContext = await browser.newContext(); // no loginViaCookie
  const page = await cleanContext.newPage();
  await page.goto("/vault/staleness");
  await expect(page).toHaveURL(/\/vault\/login$/);
  await cleanContext.close();
});
