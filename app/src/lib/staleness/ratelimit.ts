// Per-IP rate limit for triggering a staleness run. Auth already gates the
// endpoint to the single user, so like ask/ratelimit.ts this is a backstop —
// but a stricter one, since each run spends real money on Gemini calls (unlike
// a stuck client re-asking a free-ish question). In-memory, same as the other
// limiters in this app.
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

const stalenessRunLimiter = new RateLimiterMemory({
  keyPrefix: "staleness_run",
  points: 2, // 2 runs…
  duration: 60 * 60, // …per hour per IP
});

export interface StalenessRunLimitResult {
  blocked: boolean;
  retryAfterSeconds: number;
}

export async function consumeStalenessRun(ip: string): Promise<StalenessRunLimitResult> {
  try {
    await stalenessRunLimiter.consume(ip);
    return { blocked: false, retryAfterSeconds: 0 };
  } catch (res) {
    if (res instanceof RateLimiterRes) {
      return { blocked: true, retryAfterSeconds: Math.ceil(res.msBeforeNext / 1000) };
    }
    throw res;
  }
}
