// "Pick up where you left off" (design handoff §3). Server-rendered from the Ask
// history file — the latest question as a serif quote plus a few recents; each
// links into /ask?q=… to re-ask. Renders nothing when there's no history.
import Link from "next/link";
import { readRecent, type HistoryEntry } from "@/lib/history/store";

export async function ResumeCard() {
  const entries = await readRecent(4);
  if (entries.length === 0) return null;

  const [latest, ...rest] = entries;

  return (
    <section
      aria-label="Pick up where you left off"
      className="rounded-xl border border-bd bg-card p-4"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-acc">
        Pick up where you left off
      </p>

      <Link
        href={askHref(latest.question)}
        className="mt-1.5 block font-serif text-[16px] leading-snug text-tx hover:underline"
      >
        “{latest.question}”
      </Link>
      <p className="mt-0.5 text-[12px] text-mut">Asked {formatWhen(latest.askedAt)}</p>

      {rest.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-bd2 pt-3">
          {rest.map((entry) => (
            <li key={entry.id}>
              <Link
                href={askHref(entry.question)}
                className="flex items-center gap-2 text-[13px] text-tx2 hover:text-tx"
              >
                <span aria-hidden className="text-mut">↺</span>
                <span className="truncate">{entry.question}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function askHref(question: string): string {
  return `/ask?q=${encodeURIComponent(question)}`;
}

/** "2026-07-07" — a stable UTC date, so server and client agree (no hydration drift). */
function formatWhen(iso: HistoryEntry["askedAt"]): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "recently" : new Date(ms).toISOString().slice(0, 10);
}
