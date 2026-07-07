"use client";

// The folder listing with a client-side name filter. Folders navigate (next/link,
// basePath-aware); files open (inline or download, server-decided) with a separate
// Download button. The filter is purely client-side — backend search is /ask.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Entry } from "@/lib/browse/catalog";

// fetch/anchor hrefs aren't basePath-aware (unlike next/link), so spell /vault.
const FILE_BASE = "/vault/api/files";

export function BrowseList({ segments, entries }: { segments: string[]; entries: Entry[] }) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(needle));
  }, [needle, entries]);

  const encodedPath = segments.map(encodeURIComponent).join("/");
  const prefix = encodedPath ? "/" + encodedPath : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter this folder…"
          aria-label="Filter this folder"
          className="w-full rounded-xl border border-bd bg-card px-4 py-2 text-[14px] text-tx shadow-sm outline-none focus:border-acc placeholder:text-mut"
        />
        {needle && (
          <span className="shrink-0 text-[12px] text-mut">
            {filtered.length} of {entries.length}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-bd bg-card px-4 py-8 text-center text-[13px] text-tx2">
          {needle ? `No files here match “${query.trim()}”.` : "Nothing here yet."}
        </p>
      ) : (
        <ul className="divide-y divide-bd2 overflow-hidden rounded-xl border border-bd bg-card">
          {filtered.map((entry) =>
            entry.type === "dir" ? (
              <li key={entry.name}>
                <Link
                  href={`/browse${prefix}/${encodeURIComponent(entry.name)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-hdr"
                >
                  <FolderBadge />
                  <span className="flex-1 truncate text-[14px] font-medium text-tx">{entry.name}</span>
                  <span aria-hidden className="text-mut">›</span>
                </Link>
              </li>
            ) : (
              <li key={entry.name} className="flex items-center gap-3 px-4 py-3 hover:bg-hdr">
                {/* Open: inline for viewable types, download for the rest — server-decided. */}
                <a
                  href={`${FILE_BASE}${prefix}/${encodeURIComponent(entry.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <FileBadge ext={entry.ext} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-tx hover:underline">
                      {entry.name}
                    </span>
                    <span className="block truncate text-[12px] text-mut">{formatMeta(entry)}</span>
                  </span>
                </a>
                {/* Download: ?download=1 forces attachment even for inline types. */}
                <a
                  href={`${FILE_BASE}${prefix}/${encodeURIComponent(entry.name)}?download=1`}
                  download={entry.name}
                  aria-label={`Download ${entry.name}`}
                  title="Download"
                  className="shrink-0 rounded-lg p-1.5 text-tx2 hover:bg-accbg hover:text-acc"
                >
                  <span aria-hidden>⬇</span>
                </a>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function FolderBadge() {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-bd bg-hdr text-[15px]"
    >
      📁
    </span>
  );
}

function FileBadge({ ext }: { ext: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-md border border-accbd bg-accbg text-[8px] font-bold uppercase text-acc"
    >
      {ext ? ext.slice(0, 4) : "·"}
    </span>
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
