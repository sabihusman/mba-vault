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

export interface ConceptFinding {
  conceptId: string;
  name: string;
  course: string;
  verdict: Verdict;
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
    flagged: number; // verdict is "stale" or "needs_review"
    steps: number; // one Gemini comparison call = one step
    estimatedCostUsd: number;
    consecutiveErrors: number; // count at the time the run stopped/finished
  };
}

// Read by the health panel (Phase 5) — smaller than a full report on purpose.
export interface RunStatus {
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  lastRunStatus: RunStatusValue | null;
  lastRunFlaggedCount: number;
  nextScheduledRun: string | null; // filled in by the systemd timer (Phase 4); null until then
}
