"use client";

// The folder listing with a client-side name filter. Folders navigate (next/link,
// basePath-aware); files link to the file-serving route to open/download. The
// filter is purely client-side — backend search is the /ask phase, not this.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Entry } from "@/lib/browse/catalog";

// fetch/anchor hrefs aren't basePath-aware (unlike next/link), so spell /vault.
const FILE_BASE = "/vault/api/files";

export function BrowseList({ segments, entries }: { segments: string[]; entries: Entry[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(needle));
  }, [query, entries]);

  const encodedPath = segments.map(encodeURIComponent).join("/");
  const prefix = encodedPath ? "/" + encodedPath : "";

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter…"
        aria-label="Filter this folder"
        className="mb-3 w-full rounded border border-neutral-300 px-3 py-2"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {filtered.map((entry) => (
            <li key={entry.name} className="py-2">
              {entry.type === "dir" ? (
                <Link
                  href={`/browse${prefix}/${encodeURIComponent(entry.name)}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <span aria-hidden>📁</span>
                  <span className="flex-1">{entry.name}</span>
                </Link>
              ) : (
                <a
                  href={`${FILE_BASE}${prefix}/${encodeURIComponent(entry.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 hover:underline"
                >
                  <span aria-hidden>📄</span>
                  <span className="flex-1">{entry.name}</span>
                  <span className="shrink-0 text-xs text-neutral-500">{formatMeta(entry)}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "PDF · 12 KB · 2026-07-03" — extension, size, modified date. */
function formatMeta(entry: Entry): string {
  const parts: string[] = [];
  if (entry.ext) parts.push(entry.ext.toUpperCase());
  if (entry.size !== null) parts.push(formatBytes(entry.size));
  // ISO date (UTC) so server and client render identically — no hydration drift.
  parts.push(new Date(entry.modifiedMs).toISOString().slice(0, 10));
  return parts.join(" · ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
