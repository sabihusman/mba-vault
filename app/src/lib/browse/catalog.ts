/**
 * Reads the coursework directory for the browse UI: list a folder's contents, or
 * resolve a single file for download. Both go through safeResolve, so callers
 * never touch an unvalidated path.
 */
import { stat, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { safeResolve } from "./data-dir";

export type EntryType = "dir" | "file";

export interface Entry {
  name: string;
  type: EntryType;
  size: number | null; // bytes for files, null for folders
  modifiedMs: number; // mtime, epoch ms
  ext: string; // lowercase extension without the dot ("" for folders / no ext)
}

export interface Listing {
  entries: Entry[];
}

/**
 * List one directory (given as URL path segments relative to the data dir).
 * Returns null if the path is unsafe, missing, or not a directory. Hides
 * dotfiles and anything that isn't a plain file or folder (e.g. symlinks).
 */
export async function listDirectory(segments: string[]): Promise<Listing | null> {
  const abs = await safeResolve(segments);
  if (abs === null) return null;

  let dirStat;
  try {
    dirStat = await stat(abs);
  } catch {
    return null;
  }
  if (!dirStat.isDirectory()) return null;

  const dirents = await readdir(abs, { withFileTypes: true });
  const entries: Entry[] = [];
  for (const dirent of dirents) {
    if (dirent.name.startsWith(".")) continue; // hide dotfiles
    const isDir = dirent.isDirectory();
    const isFile = dirent.isFile();
    if (!isDir && !isFile) continue; // skip symlinks, sockets, devices, …

    let entryStat;
    try {
      entryStat = await stat(join(abs, dirent.name));
    } catch {
      continue; // vanished between readdir and stat
    }

    entries.push({
      name: dirent.name,
      type: isDir ? "dir" : "file",
      size: isDir ? null : entryStat.size,
      modifiedMs: entryStat.mtimeMs,
      ext: isDir ? "" : extname(dirent.name).slice(1).toLowerCase(),
    });
  }

  // Folders first, then files, each alphabetical (locale-aware, case-insensitive).
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return { entries };
}

export interface FileInfo {
  absPath: string;
  name: string;
  size: number;
  ext: string;
}

/**
 * Resolve a single downloadable file. Returns null if the path is unsafe,
 * missing, or not a regular file (so a directory or symlink-to-outside → null).
 */
export async function resolveFile(segments: string[]): Promise<FileInfo | null> {
  if (segments.length === 0) return null;
  const abs = await safeResolve(segments);
  if (abs === null) return null;

  let fileStat;
  try {
    fileStat = await stat(abs);
  } catch {
    return null;
  }
  if (!fileStat.isFile()) return null;

  return {
    absPath: abs,
    name: segments[segments.length - 1],
    size: fileStat.size,
    ext: extname(abs).slice(1).toLowerCase(),
  };
}
