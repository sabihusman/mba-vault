// Pure classifiers + formatters for the health checks. Kept separate from the
// impure collectors (fs / tls / network) so the thresholds and wording are easy
// to unit-test.
import type { Status } from "./types";

// Disk: warn when free space gets low, err when it's nearly gone. A 4 GB box with
// documents + index is the constraint, so these are deliberately conservative.
export const DISK_WARN_RATIO = 0.15;
export const DISK_ERR_RATIO = 0.05;

// Cert: the Let's Encrypt IP cert is ~6.7-day and lego-renewed daily, so under 3
// days means a renewal has likely been missed; <=1 day is an emergency.
export const CERT_WARN_DAYS = 3;
export const CERT_ERR_DAYS = 1;

// Index: fine for a while, but a very old index means ingestion hasn't run.
export const INDEX_WARN_DAYS = 30;

export function diskStatus(freeRatio: number): Status {
  if (freeRatio < DISK_ERR_RATIO) return "err";
  if (freeRatio < DISK_WARN_RATIO) return "warn";
  return "ok";
}

/** daysLeft null → the probe couldn't read a cert (unknown, not broken). */
export function certStatus(daysLeft: number | null): Status {
  if (daysLeft === null) return "unknown";
  if (daysLeft <= CERT_ERR_DAYS) return "err";
  if (daysLeft < CERT_WARN_DAYS) return "warn";
  return "ok";
}

export function indexStatus(exists: boolean, ageDays: number): Status {
  if (!exists) return "err";
  if (ageDays > INDEX_WARN_DAYS) return "warn";
  return "ok";
}

/** Whole days between two instants (floored, never negative). */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / 86_400_000));
}

/** Compact age: "5d", "3h", "12m", or "just now". */
export function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
