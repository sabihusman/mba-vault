// /vault/staleness — the Staleness Detector's report page (Phase 6). Top-level
// tab alongside Browse and Ask; gated by the proxy like every other page. A thin
// server shell: it reads the report JSON straight off the /state volume (the app
// is one unified server — no API hop, and strictly read-only: nothing on this
// page mutates state). ?run=<runId> selects an older report; the param is only
// ever matched against ids the store itself listed, never used as a path.
import type { Metadata } from "next";
import { listReportIds, readReport } from "@/lib/staleness/store";
import { pickRunId } from "@/lib/staleness/report-format";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "Report" };

// The report files change between requests (a run can finish any time) — never
// serve a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function StalenessPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  const ids = await listReportIds();
  const runId = pickRunId(ids, typeof run === "string" ? run : null);
  const report = runId ? await readReport(runId) : null;

  return (
    <main className="mx-auto w-full max-w-[1020px] flex-1 px-5 py-6 font-ui text-tx">
      <h1 className="mb-4 font-serif text-[19px] font-bold">Staleness report</h1>
      {report ? (
        <ReportView report={report} allRunIds={ids} />
      ) : (
        <div className="rounded-xl border border-bd bg-card p-5 text-[13px] text-tx2">
          <p className="mb-1 font-medium text-tx">No staleness report yet.</p>
          <p>
            Open the health pill (top right), expand the “Staleness check” row, and use{" "}
            <span className="font-medium text-tx">Run now</span> — the report appears here once a
            run completes.
          </p>
        </div>
      )}
    </main>
  );
}
