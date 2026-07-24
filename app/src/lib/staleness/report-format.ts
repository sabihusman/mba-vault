// Pure presentation logic for the Phase 6 report page, kept out of the React
// components so it's unit-testable (vitest has no "@/" alias — everything here
// is imported relatively, same convention as store.ts/proxy.ts tests).
import type { ConceptFinding, Verdict } from "./types";

// Badge tone keys — mapped to actual Tailwind classes in report-view.tsx. The
// ungrounded/no-match split is the point (spec item 4): a grounding downgrade
// always lands as verdict "couldnt_verify" WITH downgradeReason "ungrounded"
// (the model asserted current/stale but the API returned zero grounding
// sources), while an honest no-match has downgradeReason null. They must be
// distinguishable at a glance, not just inside the expansion.
export type BadgeTone = "ok" | "warn" | "err" | "neutral";

export interface VerdictBadge {
  label: string;
  tone: BadgeTone;
}

export function verdictBadge(finding: Pick<ConceptFinding, "verdict" | "downgradeReason">): VerdictBadge {
  switch (finding.verdict) {
    case "current":
      return { label: "Current", tone: "ok" };
    case "stale":
      return { label: "Stale", tone: "err" };
    case "needs_review":
      return { label: "Needs review", tone: "warn" };
    case "couldnt_verify":
      return finding.downgradeReason === "ungrounded"
        ? { label: "Couldn’t verify — ungrounded (model gave no evidence)", tone: "warn" }
        : { label: "Couldn’t verify — no external match", tone: "neutral" };
  }
}

// Worst-first ordering for the findings list: problems above reassurance.
const VERDICT_ORDER: Verdict[] = ["needs_review", "stale", "couldnt_verify", "current"];

export function sortFindings(findings: ConceptFinding[]): ConceptFinding[] {
  return [...findings].sort(
    (a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict),
  );
}

/** Resolve which report to show: an explicitly requested runId only if it
 *  actually exists (ids come from the store, the param from the URL — never
 *  trust the param as a path), otherwise the newest, otherwise none. */
export function pickRunId(ids: string[], requested: string | null): string | null {
  if (requested && ids.includes(requested)) return requested;
  return ids[0] ?? null;
}

/** Collapsed-row one-liner: the loop's own confidence note, truncated. */
export function oneLine(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + "…";
}
