// Per-IP rate limit for /ask. Auth already gates the endpoint to the single user,
// so this is a backstop against runaway Gemini cost (a stuck client, a bug), not
// an anti-abuse wall. In-memory, like the login limiter.
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

const askLimiter = new RateLimiterMemory({
  keyPrefix: "ask",
  points: 30, // 30 questions…
  duration: 60 * 60, // …per hour per IP
});

export interface AskLimitResult {
  blocked: boolean;
  retryAfterSeconds: number;
}

export async function consumeAsk(ip: string): Promise<AskLimitResult> {
  try {
    await askLimiter.consume(ip);
    return { blocked: false, retryAfterSeconds: 0 };
  } catch (res) {
    if (res instanceof RateLimiterRes) {
      return { blocked: true, retryAfterSeconds: Math.ceil(res.msBeforeNext / 1000) };
    }
    throw res;
  }
}
