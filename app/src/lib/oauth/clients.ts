// Dynamic client registration (RFC 7591) storage + redirect-URI policy.
// Single-user box, so the interesting property isn't scale — it's abuse
// resistance: a hard redirect-URI allowlist (below), a cap on stored clients
// with oldest-first eviction (Claude's DCR registers a NEW client on every
// fresh connection, per its connector docs — without eviction the file grows
// forever), and the endpoint itself is IP-rate-limited (ratelimit.ts).
//
// Redirect-URI allowlist — ALL documented Claude callbacks (Claude connector
// auth docs, "Callback URLs", fetched 2026-07-30) and nothing else:
//   1. https://claude.ai/api/mcp/auth_callback   (hosted surfaces: Claude.ai
//      web, Desktop, mobile, Cowork — the only hosted form documented; no
//      claude.com variant exists in the doc)
//   2. http://localhost/callback  \  Claude Code loopback (RFC 8252 §7.3) —
//   3. http://127.0.0.1/callback  /  matched with the PORT IGNORED, which the
//      doc says the AS must do; path must be exactly /callback.
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { getStateDir } from "../history/store";
import { serialized } from "./serialize";
import { clientIdsWithLiveRefreshTokens } from "./tokens";

const MCP_DIR = "mcp";
const CLIENTS_FILE = "clients.json";
export const MAX_CLIENTS = 20;

export interface OAuthClientRecord {
  clientId: string;
  clientName: string; // display only (consent page); sanitized length-capped
  redirectUris: string[];
  createdAt: string; // ISO — eviction order
}

interface ClientsFile {
  clients: OAuthClientRecord[];
}

const HOSTED_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Is this redirect URI allowed to be REGISTERED? (exact hosted callback, or a
 *  loopback /callback on any port). */
export function isAllowedRedirectUri(uri: string): boolean {
  if (uri === HOSTED_CALLBACK) return true;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return (
    url.protocol === "http:" &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    url.pathname === "/callback" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === ""
  );
}

/** Does a presented redirect_uri match one this client registered? Exact match,
 *  except loopback URIs compare with the port ignored (RFC 8252 §7.3; Claude
 *  Code uses an ephemeral port per session). */
export function redirectUriMatches(registered: string, presented: string): boolean {
  if (registered === presented) return true;
  let reg: URL;
  let pres: URL;
  try {
    reg = new URL(registered);
    pres = new URL(presented);
  } catch {
    return false;
  }
  if (!LOOPBACK_HOSTS.has(reg.hostname) || reg.hostname !== pres.hostname) return false;
  return (
    reg.protocol === "http:" &&
    pres.protocol === "http:" &&
    reg.pathname === pres.pathname &&
    pres.pathname === "/callback" &&
    pres.search === "" &&
    pres.hash === ""
  );
}

function clientsPath(): string {
  const base = resolve(getStateDir());
  const target = resolve(base, MCP_DIR, CLIENTS_FILE);
  if (target !== join(base, MCP_DIR, CLIENTS_FILE) || !target.startsWith(base + sep)) {
    throw new Error("unsafe clients path");
  }
  return target;
}

async function readClientsFile(): Promise<ClientsFile> {
  try {
    const parsed = JSON.parse(await readFile(clientsPath(), "utf8")) as ClientsFile;
    return Array.isArray(parsed.clients) ? parsed : { clients: [] };
  } catch {
    return { clients: [] };
  }
}

async function writeClientsFile(file: ClientsFile): Promise<void> {
  const base = resolve(getStateDir());
  await mkdir(join(base, MCP_DIR), { recursive: true });
  await writeFile(clientsPath(), JSON.stringify(file, null, 2) + "\n", "utf8");
}

export interface RegistrationRequest {
  redirect_uris: unknown;
  client_name?: unknown;
}

export type RegistrationResult =
  | { ok: true; client: OAuthClientRecord }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata" };

/** Register a client. Every redirect URI must pass the allowlist; anything else
 *  is rejected outright (no partial acceptance). */
export async function registerClient(request: RegistrationRequest, now: Date): Promise<RegistrationResult> {
  const uris = request.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 4) {
    return { ok: false, error: "invalid_client_metadata" };
  }
  if (!uris.every((u) => typeof u === "string" && isAllowedRedirectUri(u))) {
    return { ok: false, error: "invalid_redirect_uri" };
  }
  const name =
    typeof request.client_name === "string" && request.client_name.trim().length > 0
      ? request.client_name.trim().slice(0, 60)
      : "Unnamed client";

  const client: OAuthClientRecord = {
    clientId: `mcp_client_${randomBytes(16).toString("base64url")}`,
    clientName: name,
    redirectUris: uris as string[],
    createdAt: now.toISOString(),
  };

  // Serialized: read→modify→write of the whole file must not interleave with a
  // concurrent registration or the earlier one silently vanishes.
  const liveClients = await clientIdsWithLiveRefreshTokens(now);
  await serialized("clients", async () => {
    const file = await readClientsFile();
    file.clients.push(client);
    // Oldest-first eviction beyond the cap (createdAt is insertion order anyway,
    // but sort defensively — the file is hand-editable state). Phase 4 (F2):
    // clients that still hold a live refresh token are evicted LAST — a burst
    // of throwaway registrations (DCR churn is rate-limited but real) must not
    // evict the connection that's actually in use. The cap stays hard: if
    // everything is somehow live (pathological for one user), oldest-live goes.
    file.clients.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    while (file.clients.length > MAX_CLIENTS) {
      const evictable = file.clients.findIndex((c) => !liveClients.has(c.clientId));
      file.clients.splice(evictable === -1 ? 0 : evictable, 1);
    }
    await writeClientsFile(file);
  });
  return { ok: true, client };
}

export async function getClient(clientId: string): Promise<OAuthClientRecord | null> {
  const file = await readClientsFile();
  return file.clients.find((c) => c.clientId === clientId) ?? null;
}
