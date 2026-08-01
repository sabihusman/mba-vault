// The list_files tool (read scope): a thin wrapper over Browse's own
// listDirectory — containment, dotfile hiding (including .index), and
// symlink rejection are inherited from catalog.ts, not reimplemented.
import type { Listing } from "../browse/catalog";

export interface ListFilesDeps {
  listDirectory(segments: string[]): Promise<Listing | null>;
}

/** Split a forward-slash relative path into segments. Returns null for shapes
 *  we refuse outright (backslashes, absolute-looking, empty segments beyond
 *  the trivial). catalog.ts's safeResolve is the real guard — this just gives
 *  cleaner errors for obviously malformed input. */
export function parsePathSegments(path: string | undefined): string[] | null {
  if (path === undefined || path.trim() === "") return [];
  if (path.includes("\\") || path.includes("\0")) return null;
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return [];
  const segments = trimmed.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  return segments;
}

export type ListFilesResult =
  | { kind: "ok"; text: string }
  | { kind: "not_found"; message: string };

export async function listFiles(deps: ListFilesDeps, path: string | undefined): Promise<ListFilesResult> {
  const segments = parsePathSegments(path);
  if (segments === null) {
    return { kind: "not_found", message: "Invalid path. Use forward-slash relative paths from list_files output." };
  }
  const listing = await deps.listDirectory(segments);
  if (listing === null) {
    return {
      kind: "not_found",
      message: "No such folder. Call list_files with no path to see the top-level course folders.",
    };
  }
  const prefix = segments.length > 0 ? segments.join("/") + "/" : "";
  const lines = listing.entries.map((e) =>
    e.type === "dir"
      ? `[folder] ${prefix}${e.name}/`
      : `[file]   ${prefix}${e.name} (${e.size ?? 0} bytes)`,
  );
  const where = segments.length > 0 ? segments.join("/") : "the vault root";
  return {
    kind: "ok",
    text:
      lines.length > 0
        ? `Contents of ${where}:\n${lines.join("\n")}\n\nUse a [file] path with get_document to read it (if it's in the index), or a [folder] path with list_files.`
        : `${where} is empty.`,
  };
}
