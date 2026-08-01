# Session log — 2026-08-01

*MCP connector Phase 4: harden + document. Read-only audit first (every claim verified
against code with file:line), then approved fixes. No secrets in these logs — public repo.*

## Audit outcome (full detail in SECURITY.md §10)

- **Token lifecycle**: expiry enforced at verification for both token types; rotation
  deletes the old refresh token in the same serialized write (no dual-validity window);
  a stolen `/state/mcp/tokens.json` yields only SHA-256 digests + metadata — no usable
  credential. Gap found: **no revocation path existed** — disconnecting in claude.ai
  orphaned live tokens until natural expiry (≤1 h access / ≤30 d refresh).
- **DCR surface**: allowlist/cap/rate-limit all confirmed enforced. Gap found: blind
  oldest-first eviction could displace the LIVE client under churn (mild
  DoS-on-reconnect; existing tokens kept working since verification doesn't re-check
  client existence — retained deliberately, now documented).
- **Rate limits**: per-token 30/5 min bucket verified (unit-proven incl. 31st-call 429).
  `get_document` needs no own bucket — the cost asymmetry is inverted: search is the
  expensive tool (Gemini embedding); document reads are local and bandwidth-trivial.
- **Logging**: repo-wide grep — zero logging in mcp/oauth modules; nginx sees only
  paths/query (authorize params are non-secret by design). Residual risk: raw exception
  text from tool handlers → fixed (below).
- **Kill switch**: 404-before-auth confirmed in code and unit tests, drill documented.
- **Six bounds**: mapped for a passive server (HITL = consent flow; JIT = scopes;
  kill switch = MCP_ENABLED; max-iterations/timeout N/A by architecture; cost = the
  rate limit on the embedding-bearing tool).

## Fixes shipped (branch `feat/mcp-phase4-harden`)

- **F1 — RFC 7009 revocation**: `POST /vault/api/oauth/revoke`, advertised in AS
  metadata, idempotent 200 (no store-probing oracle), kills either token type.
  **UNVERIFIED whether claude.ai calls it on disconnect** — observable: watch nginx
  access logs for `/vault/api/oauth/revoke` during the next disconnect. The manual
  revoke curl (SECURITY.md §10) works regardless.
- **F2 — eviction protection**: clients holding an unexpired refresh token are evicted
  last; churn can't displace the active connection.
- **F3/F5 — generic tool errors**: unexpected tool exceptions return generic text and
  log nothing (an SDK error string could carry request detail).
- **F4 (free ride)**: the revocation write path prunes expired token records.
- Docs: SECURITY.md §10 Phase 4 block (revocation + manual curl, eviction policy,
  rate-limit reasoning, nginx query-string note, post-rotation access-token caveat,
  kill-switch drill, six-bounds table).

## Open observable

Next claude.ai disconnect: check `sudo tail /var/log/nginx/access.log | grep revoke` —
if Claude calls the endpoint, upgrade the SECURITY.md wording from UNVERIFIED; if not,
note that disconnect-side cleanup is manual-curl only.
