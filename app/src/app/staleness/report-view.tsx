"use client";

// The visible report UI (Phase 6): run-summary header, worst-first findings
// accordion (same idiom as the health panel's rows), skipped section, and past-
// run links. All finding text is model/web-derived → rendered strictly as plain
// text (never HTML/markdown — prompt-injection surface); evidence links come
// from the API's grounding metadata but are still inert outbound <a>s, never
// fetched by us. Read-only by design: no actions, no mutations — "Run now"
// stays on the health-panel row.
import { useState } from "react";
import Link from "next/link";
import type { StalenessReport, RunStatusValue } from "@/lib/staleness/types";
import { verdictBadge, sortFindings, oneLine, type BadgeTone } from "@/lib/staleness/report-format";

const STATUS_BADGE: Record<RunStatusValue, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-ok/15 text-ok" },
  partial: { label: "Partial", cls: "bg-warn/15 text-warn" },
  failed: { label: "Failed", cls: "bg-err/15 text-err" },
};

const TONE_CLS: Record<BadgeTone, string> = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  err: "bg-err/15 text-err",
  neutral: "bg-qbub text-tx2",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ReportView({
  report,
  allRunIds,
}: {
  report: StalenessReport;
  allRunIds: string[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const status = STATUS_BADGE[report.status];
  const findings = sortFindings(report.findings);
  const olderRuns = allRunIds.filter((id) => id !== report.runId);

  return (
    <div className="space-y-4">
      {/* Run summary header — this is where cost/error detail lives (kept off
          the health row on purpose). */}
      <section className="rounded-xl border border-bd bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.cls}`}>
            {status.label}
          </span>
          <span className="text-[13px] font-medium">{fmtDate(report.finishedAt)}</span>
        </div>
        {report.stopReason && (
          <p className="mb-2 text-[12px] text-warn">Stopped early: {report.stopReason}</p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-tx2 desk:grid-cols-4">
          <div>
            <dt className="text-mut">Checked</dt>
            <dd className="font-medium text-tx">
              {report.summary.conceptsChecked} / {report.summary.conceptsTotal}
            </dd>
          </div>
          <div>
            <dt className="text-mut">Flagged</dt>
            <dd className="font-medium text-tx">{report.summary.flagged}</dd>
          </div>
          <div>
            <dt className="text-mut">Ungrounded downgrades</dt>
            <dd className="font-medium text-tx">{report.summary.ungroundedDowngrades}</dd>
          </div>
          <div>
            <dt className="text-mut">Est. cost</dt>
            <dd className="font-medium text-tx">${report.summary.estimatedCostUsd.toFixed(2)}</dd>
          </div>
        </dl>
      </section>

      {/* Findings, worst first. */}
      <ul className="divide-y divide-bd2 overflow-hidden rounded-xl border border-bd bg-card">
        {findings.map((f) => {
          const badge = verdictBadge(f);
          const isOpen = expanded.has(f.conceptId);
          return (
            <li key={f.conceptId}>
              <button
                type="button"
                onClick={() => toggle(f.conceptId)}
                aria-expanded={isOpen}
                className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left hover:bg-hdr"
              >
                <span className="text-[13px] font-medium text-tx">{f.name}</span>
                <span className="text-[11px] text-mut">{f.course}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE_CLS[badge.tone]}`}
                >
                  {badge.label}
                </span>
                {f.escalated && (
                  <span className="rounded-full bg-err/15 px-2 py-0.5 text-[10px] font-semibold text-err">
                    Escalated
                  </span>
                )}
                <span className="ml-auto shrink-0 text-mut" aria-hidden>
                  {isOpen ? "⌄" : "›"}
                </span>
                <span className="w-full text-[12px] text-tx2">{oneLine(f.confidenceNote)}</span>
              </button>
              {isOpen && (
                <div className="space-y-3 px-3 pb-3 text-[12px] text-tx2">
                  {f.downgradeReason === "ungrounded" && (
                    <p className="text-warn">
                      Downgraded: the model said “{f.modelVerdict}” but the API returned zero
                      grounding sources, so the verdict was reduced to “couldn’t verify”.
                    </p>
                  )}
                  <div>
                    <p className="mb-0.5 font-medium text-tx">Coursework says</p>
                    <p className="whitespace-pre-wrap">{f.courseworkSummary}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 font-medium text-tx">Current sources say</p>
                    <p className="whitespace-pre-wrap">{f.currentSummary}</p>
                  </div>
                  {f.evidenceLinks.length > 0 && (
                    <div>
                      <p className="mb-0.5 font-medium text-tx">Evidence</p>
                      <ul className="space-y-0.5">
                        {f.evidenceLinks.map((l) => (
                          <li key={l.uri}>
                            <a
                              href={l.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-acc underline underline-offset-2"
                            >
                              {l.title || l.uri}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="mb-0.5 font-medium text-tx">Confidence note</p>
                    <p className="whitespace-pre-wrap">{f.confidenceNote}</p>
                  </div>
                  <p className="text-mut">Checked {fmtDate(f.checkedAt)}</p>
                </div>
              )}
            </li>
          );
        })}
        {findings.length === 0 && (
          <li className="px-3 py-2.5 text-[13px] text-tx2">No concepts were checked in this run.</li>
        )}
      </ul>

      {report.skipped.length > 0 && (
        <section className="rounded-xl border border-bd bg-card p-4">
          <h2 className="mb-1 text-[13px] font-medium text-tx">Skipped</h2>
          <ul className="space-y-0.5 text-[12px] text-tx2">
            {report.skipped.map((s) => (
              <li key={s.conceptId}>
                <span className="font-medium text-tx">{s.name}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {olderRuns.length > 0 && (
        <section className="text-[12px] text-tx2">
          <h2 className="mb-1 font-medium text-tx">Past runs</h2>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {olderRuns.map((id) => (
              <li key={id}>
                <Link
                  href={`/staleness?run=${id}`}
                  className="text-acc underline underline-offset-2"
                >
                  {id}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
