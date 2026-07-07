// Shared health types + the "overall = worst component" rule (design handoff §4).
// Statuses: ok / warn / err, plus "unknown" for a check we couldn't run (e.g. the
// cert probe couldn't reach the box). Unknown is less severe than a real warning —
// it means "not verified", not "broken".

export type Status = "ok" | "warn" | "err" | "unknown";

export interface Component {
  key: string;
  label: string;
  status: Status;
  metric: string; // short human-readable value ("expires in 6d", "42% free")
  lastRun: string; // ISO timestamp of this check
  error?: string; // verbatim error, shown in a mono block when present
}

export interface HealthReport {
  overall: Status;
  checkedAt: string; // ISO
  components: Component[];
}

// Severity for the worst-of rollup. Unknown sits just above ok: a check we
// couldn't run degrades the overall to "unknown" unless something is genuinely
// warn/err, which outrank it.
const SEVERITY: Record<Status, number> = { ok: 0, unknown: 1, warn: 2, err: 3 };

/** The worst (highest-severity) status in the list; "ok" for an empty list. */
export function worst(statuses: Status[]): Status {
  let acc: Status = "ok";
  for (const s of statuses) {
    if (SEVERITY[s] > SEVERITY[acc]) acc = s;
  }
  return acc;
}
