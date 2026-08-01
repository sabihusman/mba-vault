// Rate limits for the OAuth surface + the MCP endpoint itself. Separate
// in-memory buckets (same right-sizing rationale as the login limiter: one
// container, counters reset on restart, acceptable). Numbers are deliberate:
// registration and token exchange happen a handful of times per YEAR for one
// user, so tight caps cost nothing and blunt scripted abuse of the public
// endpoints; the per-token MCP cap (30/5min, user-approved) stops a runaway
// agent from draining the Gemini embedding quota.
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

const register = new RateLimiterMemory({
  keyPrefix: "oauth_register_ip",
  points: 5,
  duration: 60 * 60,
  blockDuration: 60 * 60,
});

const token = new RateLimiterMemory({
  keyPrefix: "oauth_token_ip",
  points: 20,
  duration: 60 * 60,
  blockDuration: 60 * 60,
});

export const MCP_POINTS = 30;
export const MCP_DURATION_SECONDS = 5 * 60;

const mcpPerToken = new RateLimiterMemory({
  keyPrefix: "mcp_token",
  points: MCP_POINTS,
  duration: MCP_DURATION_SECONDS,
});

async function consume(limiter: RateLimiterMemory, key: string): Promise<boolean> {
  try {
    await limiter.consume(key);
    return true;
  } catch (err) {
    if (err instanceof RateLimiterRes) return false;
    throw err;
  }
}

export const consumeRegister = (ip: string): Promise<boolean> => consume(register, ip);
export const consumeToken = (ip: string): Promise<boolean> => consume(token, ip);
/** key = tokenRateKey(accessToken) — a digest prefix, never the raw token. */
export const consumeMcp = (tokenKey: string): Promise<boolean> => consume(mcpPerToken, tokenKey);
