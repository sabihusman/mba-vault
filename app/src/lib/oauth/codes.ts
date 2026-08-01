// Authorization codes: single-use, 60-second TTL, bound to the client_id +
// redirect_uri + PKCE challenge they were issued for. Held IN MEMORY only — a
// code lives for one browser redirect hop, so persisting it buys nothing (a box
// restart mid-flow just means clicking Connect again), and memory means an
// attacker who reads the /state volume never sees a usable code.
import { randomBytes } from "node:crypto";

export const CODE_TTL_MS = 60_000;

export interface CodeGrant {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}

interface StoredCode extends CodeGrant {
  expiresAt: number; // epoch ms
}

const codes = new Map<string, StoredCode>();

function prune(now: number): void {
  for (const [code, stored] of codes) {
    if (stored.expiresAt <= now) codes.delete(code);
  }
}

export function issueCode(grant: CodeGrant, now: Date): string {
  prune(now.getTime());
  const code = `mcp_code_${randomBytes(32).toString("base64url")}`;
  codes.set(code, { ...grant, expiresAt: now.getTime() + CODE_TTL_MS });
  return code;
}

/** Redeem a code: returns its grant exactly once; expired/unknown/reused → null.
 *  The delete happens BEFORE any caller-side validation, so a code that fails
 *  PKCE downstream is still burned — replaying it can't succeed either. */
export function consumeCode(code: string, now: Date): CodeGrant | null {
  prune(now.getTime());
  const stored = codes.get(code);
  if (!stored) return null;
  codes.delete(code);
  if (stored.expiresAt <= now.getTime()) return null;
  return {
    clientId: stored.clientId,
    redirectUri: stored.redirectUri,
    codeChallenge: stored.codeChallenge,
    scope: stored.scope,
  };
}

/** Test hook: forget everything. */
export function clearCodes(): void {
  codes.clear();
}
