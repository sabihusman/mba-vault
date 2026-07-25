// Env-var overrides for the loop's hard caps (loop spec §3: "start at ~$1;
// make configurable"). Shared by the production route (POST /api/staleness/run)
// and the dev-only CLI (scripts/staleness-run.ts) so both honor the same names.
//
// Unset OR invalid values return undefined, so loop.ts's `??` defaults apply —
// behavior is bit-for-bit identical to the hardcoded values unless a var is set
// to a valid positive number. The invalid case matters: Number("abc") is NaN,
// and `NaN >= cap` is always false, so letting a garbage value through would
// silently DISABLE the cost cap rather than misconfigure it.
import type { StalenessLoopOptions } from "./loop";

export function envCap(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The cost/step cap overrides currently set in the environment, if any. The
 *  consecutive-error cap is deliberately NOT here — it's a circuit breaker,
 *  not a budget knob, and stays hardcoded (loop.ts MAX_CONSECUTIVE_ERRORS). */
export function envCapOptions(): Pick<StalenessLoopOptions, "costCapUsd" | "stepCap"> {
  return {
    costCapUsd: envCap("STALENESS_COST_CAP_USD"),
    stepCap: envCap("STALENESS_STEP_CAP"),
  };
}
