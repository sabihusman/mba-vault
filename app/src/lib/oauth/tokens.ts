// Access/refresh token issue, verification, and rotation. Opaque tokens (not
// JWTs — one server verifies its own tokens, so statelessness buys nothing and
// costs instant revocation + a signing-key lifecycle). Only SHA-256 digests are
// written to /state/mcp/tokens.json: stealing the state file yields nothing
// usable. Lookup is by digest, so verification is timing-safe by construction —
// the presented token is hashed before it touches any comparison.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { getStateDir } from "../history/store";
import { serialized } from "./serialize";

const MCP_DIR = "mcp";
const TOKENS_FILE = "tokens.json";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

interface TokenRecord {
  clientId: string;
  scope: string;
  expiresAt: string; // ISO
}

interface TokensFile {
  access: Record<string, TokenRecord>; // key = sha256 hex of the raw token
  refresh: Record<string, TokenRecord>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds, for the token response
}

export interface VerifiedToken {
  clientId: string;
  scope: string;
}

function tokensPath(): string {
  const base = resolve(getStateDir());
  const target = resolve(base, MCP_DIR, TOKENS_FILE);
  if (target !== join(base, MCP_DIR, TOKENS_FILE) || !target.startsWith(base + sep)) {
    throw new Error("unsafe tokens path");
  }
  return target;
}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function readTokensFile(): Promise<TokensFile> {
  try {
    const parsed = JSON.parse(await readFile(tokensPath(), "utf8")) as TokensFile;
    return {
      access: parsed.access && typeof parsed.access === "object" ? parsed.access : {},
      refresh: parsed.refresh && typeof parsed.refresh === "object" ? parsed.refresh : {},
    };
  } catch {
    return { access: {}, refresh: {} };
  }
}

async function writeTokensFile(file: TokensFile, now: Date): Promise<void> {
  // Prune everything expired on every write — the file self-cleans.
  for (const side of [file.access, file.refresh]) {
    for (const [key, record] of Object.entries(side)) {
      if (record.expiresAt <= now.toISOString()) delete side[key];
    }
  }
  const base = resolve(getStateDir());
  await mkdir(join(base, MCP_DIR), { recursive: true });
  await writeFile(tokensPath(), JSON.stringify(file, null, 2) + "\n", "utf8");
}

function newPair(clientId: string, scope: string, now: Date, file: TokensFile): TokenPair {
  const accessToken = `mcp_at_${randomBytes(32).toString("base64url")}`;
  const refreshToken = `mcp_rt_${randomBytes(32).toString("base64url")}`;
  file.access[digest(accessToken)] = {
    clientId,
    scope,
    expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
  };
  file.refresh[digest(refreshToken)] = {
    clientId,
    scope,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
  };
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

/** Mint a fresh access+refresh pair (authorization_code exchange). Serialized:
 *  concurrent read→modify→write cycles would silently drop one pair. */
export async function mintTokenPair(clientId: string, scope: string, now: Date): Promise<TokenPair> {
  return serialized("tokens", async () => {
    const file = await readTokensFile();
    const pair = newPair(clientId, scope, now, file);
    await writeTokensFile(file, now);
    return pair;
  });
}

/** OAuth 2.1 public-client refresh rotation: the presented refresh token is
 *  invalidated and a full new pair is issued IN THE SAME WRITE — there is no
 *  state where both old and new refresh tokens work. Unknown/expired → null
 *  (the route maps that to invalid_grant, which Claude's docs require). */
export async function rotateRefreshToken(refreshToken: string, now: Date): Promise<TokenPair | null> {
  if (!refreshToken.startsWith("mcp_rt_")) return null;
  // Serialized for the same lost-update reason as minting — and rotation's
  // "old dies as new is born" promise only holds if nothing interleaves.
  return serialized("tokens", async () => {
    const file = await readTokensFile();
    const key = digest(refreshToken);
    const record = file.refresh[key];
    if (!record || record.expiresAt <= now.toISOString()) return null;
    delete file.refresh[key];
    const pair = newPair(record.clientId, record.scope, now, file);
    await writeTokensFile(file, now);
    return pair;
  });
}

/** Verify a presented access token: known digest + not expired. */
export async function verifyAccessToken(token: string, now: Date): Promise<VerifiedToken | null> {
  if (!token.startsWith("mcp_at_")) return null;
  const file = await readTokensFile();
  const record = file.access[digest(token)];
  if (!record || record.expiresAt <= now.toISOString()) return null;
  return { clientId: record.clientId, scope: record.scope };
}

/** RFC 7009 revocation: delete the presented token wherever it lives. Checks
 *  BOTH maps (the spec's token_type_hint is just a hint, and our prefixes make
 *  the type unambiguous anyway). Deliberately returns nothing — per the RFC,
 *  revoking an unknown/expired/garbage token is indistinguishable from
 *  success, so callers can't probe the store through this path. The write
 *  also prunes expired records (F4, free here). */
export async function revokeToken(token: string): Promise<void> {
  if (!token.startsWith("mcp_at_") && !token.startsWith("mcp_rt_")) return;
  const key = digest(token);
  await serialized("tokens", async () => {
    const file = await readTokensFile();
    if (!(key in file.access) && !(key in file.refresh)) return; // nothing to do, skip the write
    delete file.access[key];
    delete file.refresh[key];
    await writeTokensFile(file, new Date());
  });
}

/** Client ids that still hold an unexpired refresh token — i.e. connections
 *  that can come back. Used by DCR eviction to avoid evicting a LIVE client
 *  under registration churn. */
export async function clientIdsWithLiveRefreshTokens(now: Date): Promise<Set<string>> {
  const file = await readTokensFile();
  const live = new Set<string>();
  for (const record of Object.values(file.refresh)) {
    if (record.expiresAt > now.toISOString()) live.add(record.clientId);
  }
  return live;
}

/** Stable per-token key for rate limiting: a digest PREFIX, never the token. */
export function tokenRateKey(token: string): string {
  return digest(token).slice(0, 16);
}
