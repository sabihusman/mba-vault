// POST /vault/api/logout — end the session. destroy() clears the sealed cookie
// (emits a Set-Cookie that expires it); the client then navigates to /login.
// Allowlisted in the proxy gate so it works whether or not the cookie is still
// valid (logging out should never require being "properly" logged in).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function POST(): Promise<NextResponse> {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
