// POST /vault/api/login — the single-step login endpoint.
//
// Composes the three auth primitives in order: count the attempt (lockout),
// verify all three factors, then seal the session cookie. Every failure returns
// the SAME generic message so the response never reveals which factor was wrong
// (wrong username, wrong password, and wrong TOTP are indistinguishable).
//
// This route must stay reachable WITHOUT a session — PR4's proxy gate allowlists
// /vault/login and /vault/api/login. Do not add a session check here.
import { NextResponse } from "next/server";
import { verifyLogin } from "@/lib/auth/verify";
import { consumeLoginAttempt, resetLoginAttempts } from "@/lib/auth/ratelimit";
import { clientIp } from "@/lib/auth/request-ip";
import { getSession } from "@/lib/auth/session";

// One message for every credential failure — no oracle for attackers.
const INVALID = "Invalid username, password, or code.";

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const creds = readCredentials(body);
  const ip = clientIp(request);

  // A malformed body still counts as an attempt against the IP, so a scripted
  // attacker can't probe forever by sending junk. Use a placeholder username so
  // the per-user limiter isn't polluted by unparseable requests.
  const username = creds?.username ?? "";
  const limit = await consumeLoginAttempt(ip, username || "-");
  if (limit.blocked) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (!creds || !(await verifyLogin(creds))) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  // Success: clear the lockout counters and seal the session.
  await resetLoginAttempts(ip, creds.username);
  const session = await getSession();
  session.username = creds.username;
  session.loggedInAt = Date.now();
  await session.save();

  return NextResponse.json({ ok: true });
}

interface Credentials {
  username: string;
  password: string;
  token: string;
}

/** Pull the three string fields, or null if the body isn't the expected shape. */
function readCredentials(body: unknown): Credentials | null {
  if (typeof body !== "object" || body === null) return null;
  const { username, password, token } = body as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string" || typeof token !== "string") {
    return null;
  }
  return { username, password, token };
}
