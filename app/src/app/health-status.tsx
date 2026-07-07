"use client";

// The header health pill + drill-down panel (design handoff §3). Polls the gated
// /api/status aggregate every 5 minutes (and on open), shows a dot + label skinned
// by the worst component, and expands into a per-component accordion. Non-ok rows
// auto-expand. The health *data* is computed server-side in lib/health.
import { useCallback, useEffect, useState } from "react";
import type { HealthReport, Status } from "@/lib/health/types";

const STATUS_URL = "/vault/api/status";
const POLL_MS = 5 * 60 * 1000;

const OVERALL_LABEL: Record<Status, string> = {
  ok: "Healthy",
  warn: "Degraded",
  err: "Attention",
  unknown: "Unknown",
};

// dot + text colour per status, using the Study Desk health tokens.
const DOT: Record<Status, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  unknown: "bg-mut",
};

export function HealthStatus() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(STATUS_URL, { cache: "no-store" });
      if (res.ok) setReport((await res.json()) as HealthReport);
    } catch {
      /* transient — keep the last known report */
    }
  }, []);

  useEffect(() => {
    // load() only setState()s after an await (fetch), so this is an async poll, not
    // a synchronous cascade — safe despite the set-state-in-effect heuristic.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const overall: Status = report?.overall ?? "unknown";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          void load();
        }}
        aria-label={`System health: ${report ? OVERALL_LABEL[overall] : "checking"}`}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-bd px-2.5 py-1 text-[11px] font-semibold text-tx2 hover:bg-hdr"
      >
        <span aria-hidden className={`h-2 w-2 rounded-full ${DOT[overall]}`} />
        <span className="hidden desk:inline">{report ? OVERALL_LABEL[overall] : "…"}</span>
      </button>

      {open && report && (
        <HealthPanel report={report} onClose={() => setOpen(false)} onRefresh={load} />
      )}
    </div>
  );
}

function HealthPanel({
  report,
  onClose,
  onRefresh,
}: {
  report: HealthReport;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  // Auto-expand any component that isn't healthy so problems are visible on open.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(report.components.filter((c) => c.status !== "ok").map((c) => c.key)),
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <>
      {/* Scrim: closes on tap; also darkens the mobile bottom sheet. */}
      <div className="fixed inset-0 z-30 bg-black/20 desk:bg-transparent" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="System health"
        className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-bd bg-card p-4 shadow-lg desk:absolute desk:inset-x-auto desk:right-0 desk:top-10 desk:bottom-auto desk:w-[440px] desk:rounded-xl"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-serif text-[15px] font-semibold text-tx">System health</h2>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="rounded-lg border border-bd px-2 py-1 text-[11px] text-tx2 hover:bg-hdr"
          >
            Refresh
          </button>
        </div>

        <ul className="divide-y divide-bd2 overflow-hidden rounded-xl border border-bd">
          {report.components.map((c) => {
            const isOpen = expanded.has(c.key);
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-hdr"
                >
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[c.status]}`} />
                  <span className="flex-1 text-[13px] font-medium text-tx">{c.label}</span>
                  <span className="text-[12px] text-tx2">{c.metric}</span>
                  <span aria-hidden className="text-mut">{isOpen ? "⌄" : "›"}</span>
                </button>
                {isOpen && (
                  <div className="space-y-2 px-3 pb-3 text-[12px] text-tx2">
                    <p>Last checked {new Date(c.lastRun).toLocaleTimeString()}</p>
                    {c.error && (
                      <pre className="overflow-x-auto rounded-lg bg-[#1e1b17] p-2 text-[11px] text-[#e8ddc8]">
                        {c.error}
                      </pre>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-center text-[11px] text-mut">
          Checked every 5 min · overall = worst component
        </p>
      </div>
    </>
  );
}
