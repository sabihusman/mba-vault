// Shared types for the Staleness Detector's state: the concept check-list that
// drives every future loop run. Concepts start "pending" from auto-extraction
// and only become "active" (checked monthly) or "rejected" (skipped) once the
// user reviews them — see store.ts / concepts.ts.

export type ConceptStatus = "pending" | "active" | "rejected";

export interface Concept {
  id: string; // stable slug: course + name, survives re-runs so review isn't lost
  name: string;
  course: string;
  description: string; // one line, what the coursework says this concept is
  status: ConceptStatus;
  lastCheckedAt: string | null; // ISO; null until the loop (Phase 2) first checks it
}

export interface ConceptList {
  generatedAt: string; // ISO, last time bootstrap ran (added new pending concepts)
  concepts: Concept[];
}

// A concept never gets marked "stale" without a cited source (loop spec §5);
// "needs_review" covers both prompt-injection escalation and genuinely
// contested/judgment-heavy topics — see ConceptFinding.escalated to tell them
// apart. "couldnt_verify" means nothing usable was found — never a guess.
export type Verdict = "current" | "stale" | "needs_review" | "couldnt_verify";

export interface EvidenceLink {
  title: string;
  uri: string;
}

// The only downgrade reason today: the model asserted "current"/"stale" but the
// API's real grounding metadata came back with zero sources — i.e. it answered
// from training memory, not an actual search. Never applied to an already-honest
// "couldnt_verify"/"needs_review" from the model itself (see applyGroundingRule
// in gemini.ts) — this is a distinct signal from ConceptFinding.escalated.
export type DowngradeReason = "ungrounded";

export interface ConceptFinding {
  conceptId: string;
  name: string;
  course: string;
  verdict: Verdict; // final verdict, after any escalation/grounding-rule override
  modelVerdict: Verdict; // what the model itself said, never overwritten
  downgradeReason: DowngradeReason | null;
  courseworkSummary: string; // (a) — the retrieved coursework excerpts + source refs, verbatim
  currentSummary: string; // (b) — what current sources say, from the grounded model call
  evidenceLinks: EvidenceLink[]; // (c) — from the API's own grounding metadata, never model-authored
  confidenceNote: string; // (d)
  escalated: boolean; // true only for suspected prompt injection in the model's output
  checkedAt: string; // ISO
}

export interface SkippedConcept {
  conceptId: string;
  name: string;
  reason: string; // e.g. "run stopped early: per-run cost cap ($1) reached"
}

export type RunStatusValue = "ok" | "partial" | "failed";

export interface StalenessReport {
  runId: string; // startedAt, filesystem-safe (colons/dots replaced)
  startedAt: string; // ISO
  finishedAt: string; // ISO
  status: RunStatusValue;
  stopReason: string | null; // set when status is "partial"/"failed"
  findings: ConceptFinding[];
  skipped: SkippedConcept[]; // active concepts never attempted (stuck-stop before reaching them)
  summary: {
    conceptsTotal: number; // active concepts at run start
    conceptsChecked: number; // findings.length
    flagged: number; // final verdict is "stale" or "needs_review"
    ungroundedDowngrades: number; // findings with downgradeReason === "ungrounded"
    steps: number; // one Gemini comparison call = one step
    estimatedCostUsd: number;
    consecutiveErrors: number; // count at the time the run stopped/finished
  };
}

// Read by the health panel (Phase 5) and the Phase 3 status endpoint — smaller
// than a full report on purpose. Always reflects the last COMPLETED run only;
// "is a run in progress right now" is a separate, deliberately non-persisted
// signal (see run-guard.ts) layered on top by the status endpoint.
export interface RunStatus {
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  lastRunStatus: RunStatusValue | null;
  lastRunFlaggedCount: number;
  lastRunConceptsChecked: number;
  lastRunConceptsTotal: number;
  lastRunUngroundedDowngrades: number;
  nextScheduledRun: string | null; // filled in by the systemd timer (Phase 4); null until then
}
