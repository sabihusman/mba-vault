// Login lockout using in-memory counters (no store/DB — right-sized for one user
// on one container; counters reset on restart, which is acceptable). Two limiters
// run together: per-IP (stops one host guessing) and per-username (stops a
// distributed guess at the account). Either tripping blocks the attempt.
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

const WINDOW_SECONDS = 15 * 60;
const BLOCK_SECONDS = 15 * 60;

const perIp = new RateLimiterMemory({
  keyPrefix: "login_ip",
  points: 10, // 10 failed-ish attempts per IP per window
  duration: WINDOW_SECONDS,
  blockDuration: BLOCK_SECONDS,
});

const perUser = new RateLimiterMemory({
  keyPrefix: "login_user",
  points: 5, // 5 attempts per username per window
  duration: WINDOW_SECONDS,
  blockDuration: BLOCK_SECONDS,
});

export interface RateLimitResult {
  blocked: boolean;
  retryAfterSeconds: number;
}

/**
 * Count one login attempt against both limiters. Returns blocked=true (with a
 * retry hint) if either limiter is now, or was already, exhausted. Call this
 * BEFORE verifying credentials; call resetLoginAttempts() after a success.
 */
export async function consumeLoginAttempt(ip: string, username: string): Promise<RateLimitResult> {
  const userKey = username.toLowerCase();
  const outcomes = await Promise.allSettled([perIp.consume(ip), perUser.consume(userKey)]);

  let blocked = false;
  let retryMs = 0;
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      blocked = true;
      const reason: unknown = outcome.reason;
      if (reason instanceof RateLimiterRes) {
        retryMs = Math.max(retryMs, reason.msBeforeNext);
      } else {
        throw reason; // unexpected (memory store shouldn't error)
      }
    }
  }
  return { blocked, retryAfterSeconds: Math.ceil(retryMs / 1000) };
}

/** Clear both counters after a successful login so the user isn't penalised. */
export async function resetLoginAttempts(ip: string, username: string): Promise<void> {
  await Promise.all([perIp.delete(ip), perUser.delete(username.toLowerCase())]);
}
