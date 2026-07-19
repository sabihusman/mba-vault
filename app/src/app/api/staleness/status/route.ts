// GET /vault/api/staleness/status — status for the "Run staleness check" UI
// trigger (Phase 3) and, later, the health panel row (Phase 5) and
// report UI (Phase 6). Gated by the proxy like every other protected route.
// `running`/`currentRunId` come LIVE from the in-process guard (never
// persisted — see run-guard.ts); everything else is the last COMPLETED run's
// status from /state. Never cached, matching /api/status.
// Relative imports (not "@/") — this route is unit-tested directly (unlike
// the POST route, which uses next/server's after() and can't be), and the
// "@/" alias isn't configured for vitest (see index-store.ts/search.ts).
import { readRunStatus } from "../../../../lib/staleness/store";
import { isRunning, currentRunId } from "../../../../lib/staleness/run-guard";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const status = await readRunStatus();
  return Response.json(
    { running: isRunning(), currentRunId: currentRunId(), ...status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
