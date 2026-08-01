// /vault/oauth/authorize — the consent step (SECURITY.md §10). Session-gated
// by the proxy like every page: with no session the proxy redirects to
// /login?next=<this URL>, so "consent = the existing login + TOTP" needs no
// auth code here at all. By the time this renders, a human with the password
// and the authenticator is looking at it.
//
// The Approve/Deny form POSTs to /vault/api/oauth/decision, which re-validates
// every hidden field (they're untrusted). CSRF: the decision route is behind
// the session gate, and the session cookie is SameSite=Lax — a cross-site POST
// arrives cookie-less and bounces off the proxy as 401.
import type { Metadata } from "next";
import { validateAuthorizeRequest } from "@/lib/oauth/authorize-request";

export const metadata: Metadata = { title: "Authorize access" };
export const dynamic = "force-dynamic";

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  const validation = await validateAuthorizeRequest({
    client_id: first(raw.client_id),
    redirect_uri: first(raw.redirect_uri),
    response_type: first(raw.response_type),
    state: first(raw.state),
    code_challenge: first(raw.code_challenge),
    code_challenge_method: first(raw.code_challenge_method),
    scope: first(raw.scope),
  });

  if (validation.kind === "reject") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 p-6 font-ui">
        <h1 className="font-serif text-[22px] font-bold text-tx">Can’t authorize</h1>
        <p className="text-sm text-tx2">{validation.reason}</p>
      </main>
    );
  }

  if (validation.kind === "redirect_error") {
    // A trusted redirect target with a malformed request: hand the error back
    // as a normal OAuth callback via a plain link (no auto-redirect from a
    // server component; one click is fine for an error path this rare).
    const url = new URL(validation.redirectUri);
    url.searchParams.set("error", validation.error);
    if (validation.state) url.searchParams.set("state", validation.state);
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 p-6 font-ui">
        <h1 className="font-serif text-[22px] font-bold text-tx">Request problem</h1>
        <p className="text-sm text-tx2">
          The authorization request was malformed ({validation.error}).
        </p>
        <a className="text-sm text-acc underline underline-offset-2" href={url.toString()}>
          Return to the requesting app
        </a>
      </main>
    );
  }

  const redirectHost = new URL(validation.redirectUri).host;
  const isLoopback = redirectHost.startsWith("localhost") || redirectHost.startsWith("127.0.0.1");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 p-6 font-ui">
      <div>
        <h1 className="font-serif text-[22px] font-bold text-tx">Authorize access</h1>
        <p className="mt-1 text-sm text-tx2">
          <span className="font-medium text-tx">{validation.client.clientName}</span> is asking for{" "}
          <span className="font-medium text-tx">read-only search</span> access to your vault
          (tool: <code>search_vault</code>). It can’t read whole files, write anything, or see
          your Ask history.
        </p>
        {/* The MCP auth spec requires showing the redirect host on consent —
            it's the one honest signal of where the code will be sent. */}
        <p className="mt-2 text-[12px] text-mut">
          You’ll be sent back to: <span className="font-medium">{redirectHost}</span>
        </p>
        {isLoopback && (
          <p className="mt-1 text-[12px] text-warn">
            This is a loopback address — only approve if you just started this flow yourself in
            a local app (e.g. Claude Code) on this machine.
          </p>
        )}
      </div>

      <form method="post" action="/vault/api/oauth/decision" className="flex gap-3">
        <input type="hidden" name="client_id" value={validation.client.clientId} />
        <input type="hidden" name="redirect_uri" value={validation.redirectUri} />
        <input type="hidden" name="response_type" value="code" />
        {validation.state !== null && <input type="hidden" name="state" value={validation.state} />}
        <input type="hidden" name="code_challenge" value={validation.codeChallenge} />
        <input type="hidden" name="code_challenge_method" value="S256" />
        <input type="hidden" name="scope" value={validation.scope} />
        <button
          type="submit"
          name="action"
          value="approve"
          className="rounded-xl bg-acc px-4 py-2 font-semibold text-white"
        >
          Approve
        </button>
        <button
          type="submit"
          name="action"
          value="deny"
          className="rounded-xl border border-bd px-4 py-2 font-semibold text-tx2 hover:text-tx"
        >
          Deny
        </button>
      </form>
    </main>
  );
}
