"use client";

// The "Run now" action for the Staleness Detector's health-panel row (Phase
// 5). Lives INSIDE that row's expanded accordion slot (health-status.tsx
// special-cases c.key === "staleness" to render this instead of the generic
// expanded block) — the row's collapsed header already shows the persisted
// last-run summary (via buildReport()'s checkStaleness()), so this component
// only needs the button + a transient result message.
//
// It keeps its OWN fetch to /api/staleness/status rather than reusing the
// parent's /api/status poll, because it needs `running`/`currentRunId` — live
// in-process state (run-guard.ts) that a 5-min-cached Component snapshot
// deliberately doesn't carry. Fetches once when the row expands (mounts); no
// separate polling interval.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const STATUS_URL = "/vault/api/staleness/status";
const RUN_URL = "/vault/api/staleness/run";

interface StalenessStatus {
  running: boolean;
  currentRunId: string | null;
}

export function StalenessTrigger() {
  const [status, setStatus] = useState<StalenessStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(STATUS_URL, { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as StalenessStatus);
    } catch {
      /* transient — keep the last known status */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const run = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(RUN_URL, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (res.status === 202) {
        setMessage(`Started (run ${body.runId ?? "?"}) — check back in a few minutes.`);
      } else if (res.status === 409) {
        setMessage("Already running — try again once it finishes.");
      } else if (res.status === 429) {
        setMessage("Too many checks recently — try again later.");
      } else if (res.status === 503) {
        setMessage("Not configured (missing GEMINI_API_KEY).");
      } else {
        setMessage(body.error ?? "Something went wrong starting the check.");
      }
      void load();
    } catch {
      setMessage("Network error starting the check.");
    } finally {
      setBusy(false);
    }
  }, [load]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || Boolean(status?.running)}
        className="rounded-lg border border-accbd bg-accbg px-2.5 py-1 text-[11px] font-medium text-acc hover:border-acc disabled:opacity-50"
      >
        {status?.running ? "Running…" : "Run now"}
      </button>
      {/* Secondary entry point — the primary one is the top-level Report tab. */}
      <Link
        href="/staleness"
        className="ml-2 text-[11px] text-acc underline underline-offset-2"
      >
        View report
      </Link>
      {message && <p className="text-[11px] text-tx2">{message}</p>}
    </div>
  );
}
