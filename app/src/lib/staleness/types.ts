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
