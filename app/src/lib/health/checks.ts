// The health collectors: one per component, plus buildReport() to run them all.
// Everything runs INSIDE the app container, which shapes what each can see:
//   - index + disk: read from the mounted /data (read-only, but reads are fine)
//   - gemini: an outbound reachability probe (cached, no token cost)
//   - cert: a TLS probe to the box's own public IP:443 (needs PUBLIC_HOST; the
//     container can't see the host's /etc/lego cert files directly)
//   - container: trivially ok if this code is running at all
import { readFile, statfs } from "node:fs/promises";
import { join } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { GoogleGenAI } from "@google/genai";
import { getDataDir } from "../browse/data-dir";
import { readRunStatus } from "../staleness/store";
import type { Component, HealthReport } from "./types";
import { worst } from "./types";
import {
  diskStatus,
  certStatus,
  indexStatus,
  stalenessStatus,
  daysBetween,
  formatAge,
  formatBytes,
  formatDate,
} from "./classify";

const PROBE_TTL_MS = 5 * 60 * 1000; // cache the network probes for a poll cycle

// Module-level cache so polling every 5 min doesn't hammer Gemini / the TLS probe.
const probeCache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = probeCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < PROBE_TTL_MS) return hit.value as T;
  const value = await fn();
  probeCache.set(key, { at: now, value });
  return value;
}

function checkContainer(): Component {
  const uptimeMs = process.uptime() * 1000;
  return {
    key: "container",
    label: "App container",
    status: "ok",
    metric: `up ${formatAge(uptimeMs)}`,
    lastRun: new Date().toISOString(),
  };
}

async function checkIndex(): Promise<Component> {
  const now = Date.now();
  const base: Omit<Component, "status" | "metric"> = {
    key: "index",
    label: "Search index",
    lastRun: new Date(now).toISOString(),
  };
  try {
    const raw = await readFile(join(getDataDir(), ".index", "manifest.json"), "utf8");
    const manifest = JSON.parse(raw) as { count?: number; createdAt?: string };
    const count = typeof manifest.count === "number" ? manifest.count : 0;
    const createdMs = manifest.createdAt ? Date.parse(manifest.createdAt) : NaN;
    const ageDays = Number.isNaN(createdMs) ? 0 : daysBetween(createdMs, now);
    const ageLabel = Number.isNaN(createdMs) ? "unknown age" : `built ${formatAge(now - createdMs)} ago`;
    return {
      ...base,
      status: indexStatus(true, ageDays),
      metric: `${count.toLocaleString()} chunks · ${ageLabel}`,
    };
  } catch (err) {
    return {
      ...base,
      status: indexStatus(false, 0),
      metric: "not found",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkDisk(): Promise<Component> {
  const base: Omit<Component, "status" | "metric"> = {
    key: "disk",
    label: "Disk space",
    lastRun: new Date().toISOString(),
  };
  try {
    const fs = await statfs(getDataDir());
    // bavail: blocks available to unprivileged users; the honest "free" figure.
    const freeBytes = Number(fs.bavail) * Number(fs.bsize);
    const totalBytes = Number(fs.blocks) * Number(fs.bsize);
    const freeRatio = totalBytes > 0 ? Number(fs.bavail) / Number(fs.blocks) : 0;
    return {
      ...base,
      status: diskStatus(freeRatio),
      metric: `${formatBytes(freeBytes)} free (${Math.round(freeRatio * 100)}%)`,
    };
  } catch (err) {
    return { ...base, status: "unknown", metric: "unavailable", error: errMsg(err) };
  }
}

async function checkGemini(): Promise<Component> {
  const base: Omit<Component, "status" | "metric"> = {
    key: "gemini",
    label: "Gemini API",
    lastRun: new Date().toISOString(),
  };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ...base, status: "err", metric: "not configured", error: "GEMINI_API_KEY is not set" };
  }
  return cached("gemini", async () => {
    try {
      // list() performs a lightweight, no-token API round-trip — enough to prove
      // the key works and Gemini is reachable.
      const ai = new GoogleGenAI({ apiKey });
      await ai.models.list();
      return { ...base, status: "ok" as const, metric: "reachable" };
    } catch (err) {
      return { ...base, status: "err" as const, metric: "unreachable", error: errMsg(err) };
    }
  });
}

async function checkCert(): Promise<Component> {
  const base: Omit<Component, "status" | "metric"> = {
    key: "cert",
    label: "HTTPS cert",
    lastRun: new Date().toISOString(),
  };
  const host = process.env.PUBLIC_HOST;
  if (!host) {
    return { ...base, status: "unknown", metric: "PUBLIC_HOST not set" };
  }
  return cached("cert", async () => {
    const validTo = await probeCertExpiry(host);
    const daysLeft = validTo ? daysBetween(Date.now(), validTo.getTime()) : null;
    if (daysLeft === null) {
      return { ...base, status: "unknown" as const, metric: "could not reach :443" };
    }
    return {
      ...base,
      status: certStatus(daysLeft),
      metric: daysLeft <= 0 ? "expired" : `expires in ${daysLeft}d`,
    };
  });
}

/** Open a TLS socket and read the peer cert's notAfter. Trust isn't validated —
 *  we only want the expiry — so rejectUnauthorized is off. */
function probeCertExpiry(host: string, port = 443, timeoutMs = 4000): Promise<Date | null> {
  return new Promise((resolve) => {
    const socket = tlsConnect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert && cert.valid_to ? new Date(cert.valid_to) : null);
    });
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(null);
    });
    socket.on("error", () => resolve(null));
  });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Dead-man's-switch on the MACHINERY only (stalenessStatus never sees findings
// — see classify.ts). readRunStatus() already falls back to an empty/never-run
// status on any read error, so this never needs its own try/catch.
async function checkStaleness(): Promise<Component> {
  const now = Date.now();
  const runStatus = await readRunStatus();
  const metric =
    runStatus.lastRunStatus === null
      ? "Never run"
      : `Last run: ${formatDate(runStatus.lastRunCompletedAt ?? runStatus.lastRunStartedAt ?? new Date(now).toISOString())} · ` +
        `${runStatus.lastRunConceptsChecked} checked · ${runStatus.lastRunFlaggedCount} flagged`;
  return {
    key: "staleness",
    label: "Staleness check",
    status: stalenessStatus(runStatus, now),
    metric,
    lastRun: new Date(now).toISOString(),
  };
}

/** Run every check and roll up to overall = worst component (handoff §4). Order
 *  matches the panel: container, cert, index, gemini, disk, staleness. */
export async function buildReport(): Promise<HealthReport> {
  const [container, cert, index, gemini, disk, staleness] = await Promise.all([
    Promise.resolve(checkContainer()),
    checkCert(),
    checkIndex(),
    checkGemini(),
    checkDisk(),
    checkStaleness(),
  ]);
  const components = [container, cert, index, gemini, disk, staleness];
  return {
    overall: worst(components.map((c) => c.status)),
    checkedAt: new Date().toISOString(),
    components,
  };
}
