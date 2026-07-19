// POST /vault/api/staleness/run — trigger the Staleness Detector loop (Phase
// 2). Gated by the proxy (not in isPublicPath) and rate-limited, same as every
// other protected mutating endpoint. Fire-and-forget: the loop runs in the
// background via next/server's `after()`, which is fully supported when
// self-hosting with `next start` (verified against the bundled Next 16 docs) —
// the request returns immediately with a runId rather than holding the
// connection open for however long the whole check takes.
//
// The actual trigger logic lives in lib/staleness/trigger.ts as a plain,
// Next-runtime-free function: `after()` throws if called outside a real
// request scope, so it can't be exercised by calling this route's POST()
// directly in a unit test. This file only wires the real dependencies.
import { after } from "next/server";
import { clientIp } from "@/lib/auth/request-ip";
import { consumeStalenessRun } from "@/lib/staleness/ratelimit";
import { tryAcquireRunLock, releaseRunLock, currentRunId } from "@/lib/staleness/run-guard";
import { createRealOrchestrateDeps, executeStalenessRun } from "@/lib/staleness/orchestrate";
import { triggerStalenessRun } from "@/lib/staleness/trigger";

export async function POST(request: Request): Promise<Response> {
  const result = await triggerStalenessRun(
    {
      consumeRateLimit: consumeStalenessRun,
      hasApiKey: () => Boolean(process.env.GEMINI_API_KEY),
      tryAcquireRunLock,
      releaseRunLock,
      currentRunId,
      scheduleAfterResponse: after,
      executeRun: (startedAt) => {
        // hasApiKey() above already proved this is set.
        const apiKey = process.env.GEMINI_API_KEY!;
        return executeStalenessRun(createRealOrchestrateDeps(apiKey), startedAt);
      },
      now: () => new Date(),
    },
    clientIp(request),
  );

  switch (result.kind) {
    case "rate_limited":
      return Response.json(
        { error: "Too many staleness checks. Try again later." },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
      );
    case "not_configured":
      return Response.json(
        { error: "Staleness check is not configured (missing GEMINI_API_KEY)." },
        { status: 503 },
      );
    case "already_running":
      return Response.json({ status: "already_running", runId: result.runId }, { status: 409 });
    case "started":
      return Response.json({ status: "started", runId: result.runId }, { status: 202 });
  }
}
